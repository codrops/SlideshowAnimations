import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions
import { Stage, cover } from '../webgl/Stage.js'; // WebGL canvas over the slides
import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  floor,
  mix,
  smoothstep,
  select,
  sin,
  hash,
  length,
  normalize,
  varying,
  instanceIndex,
  Discard,
  PI,
} from 'three/tsl';

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** Pixels start moving between 0 and SPREAD, and fly for FLIGHT, both in progress units */
const SPREAD = 0.6;
const FLIGHT = 0.4;
/** Pixels pair up within this many bands of brightness, and leave band by band */
const BANDS = 12;

/**
 * Draws an image at a small size, framed like the slides (background-size: cover, centred),
 * and returns each cell's tone, bottom row first.
 * @param {HTMLImageElement} image
 * @param {number} cols
 * @param {number} rows
 * @returns {Float32Array}
 */
const tonesOf = (image, cols, rows) => {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(cols / image.width, rows / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  context.drawImage(image, (cols - w) / 2, (rows - h) / 2, w, h);
  const { data } = context.getImageData(0, 0, cols, rows);
  const tones = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = ((rows - 1 - row) * cols + col) * 4;
      // (a touch of noise, so equal tones pair up at random rather than in reading order)
      tones[row * cols + col] =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 + Math.random() * 0.002;
    }
  }
  return tones;
};

/**
 * A cell's place along a Hilbert curve filling an n x n grid (n a power of two): cells that are
 * close along the curve are close on the screen, without the seams of rows or tiles.
 * @param {number} n
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
const hilbert = (n, x, y) => {
  let d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
      [x, y] = [y, x];
    }
  }
  return d;
};

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: the next image is made out of the current one's pixels. The
 * screen is a grid of tiny cells, each one a pixel that can fly. Every pixel
 * of the current image is paired with a place in the next image of the same
 * brightness (the brightest with the brightest, the darkest with the darkest,
 * as near as it can find), and they lift off in order, highlights first, then
 * the middle tones, then the shadows, and fly in soft curves to their new
 * places, shifting colour on the way, until the next image has been rebuilt
 * from the current one. Where a pixel has left, a soft blur of the two images
 * shows through. Going back rewinds it.
 * @export
 */
export class Slideshow {
  /**
   * Holds references to relevant DOM elements.
   * @type {Object}
   */
  DOM = {
    el: null, // Main slideshow container
    slides: null, // Individual slides
    slidesInner: null, // Inner content of slides (usually images)
  };
  /**
   * Index of the current slide being displayed.
   * @type {number}
   */
  current = 0;
  /**
   * Total number of slides.
   * @type {number}
   */
  slidesTotal = 0;

  /**
   * Flag to indicate if an animation is running.
   * @type {boolean}
   */
  isAnimating = false;

  /**
   * Flag to indicate if the WebGL stage can draw the transition.
   * @type {boolean}
   */
  isReady = false;

  /**
   * Shader inputs.
   * @type {Object}
   */
  uniforms = {
    progress: uniform(0), // 0 = the current image, 1 = the next one
    cellSize: uniform(4), // One pixel per cell, in CSS pixels
    grid: uniform(new THREE.Vector2(1, 1)), // Cells across and down
    level: uniform(0), // Mipmap level that averages one cell of an image
    cells: null, // Per cell: when its pixel leaves, when the one landing there arrives, where it goes
    mapA: null, // The image the pixels leave, set up in createScene
    mapB: null, // The one they build
    sizeA: uniform(new THREE.Vector2(1, 1)),
    sizeB: uniform(new THREE.Vector2(1, 1)),
  };

  /**
   * Slideshow constructor.
   * Initializes the slideshow and sets up the DOM elements.
   * @param {HTMLElement} DOM_el - The main element holding all the slides.
   */
  constructor(DOM_el) {
    // Initialize DOM elements
    this.DOM.el = DOM_el;
    this.DOM.slides = [...this.DOM.el.querySelectorAll('.slide')];
    this.DOM.slidesInner = this.DOM.slides.map((item) =>
      item.querySelector('.slide__img')
    );

    // Set initial slide as current
    this.DOM.slides[this.current].classList.add('slide--current');

    // Count total slides
    this.slidesTotal = this.DOM.slides.length;

    // Set up the WebGL stage. Until it's ready (or if it can't start), slides crossfade.
    this.stage = new Stage(this.DOM.el);
    this.stage.onLost = () => (this.isReady = false);
    this.stage
      .init(this.DOM.slidesInner)
      .then(() => {
        this.createScene();
        return this.stage.compile();
      })
      .then(() => (this.isReady = true))
      .catch((error) => console.warn('WebGL unavailable, slides will crossfade.', error));
  }

  /**
   * Builds the blurred backdrop, the two images and the pixels.
   * @returns {void}
   */
  createScene() {
    const { viewport, textures } = this.stage;
    // Two different textures to start with: nodes made from the same one would share a binding
    this.uniforms.mapA = texture(textures[0]);
    this.uniforms.mapB = texture(textures[1]);
    this.cellData = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    this.cellData.magFilter = this.cellData.minFilter = THREE.NearestFilter;
    this.uniforms.cells = texture(this.cellData);
    const { progress, cellSize, grid, level, cells, mapA, mapB, sizeA, sizeB } = this.uniforms;

    // How far along a pixel is, from when it leaves: 0 = in place, 1 = landed
    const flight = (delay) => progress.mul(SPREAD + FLIGHT).sub(delay).div(FLIGHT).clamp(0, 1);
    // A cell's data, read from the middle of its texel
    const cellAt = (cell) => texture(cells, cell.add(0.5).div(grid)).level(0);

    // Behind everything, a dimmed blur of the two images (a small mipmap), turning from one to
    // the other
    const materialBackdrop = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialBackdrop.colorNode = Fn(() => {
      const softA = texture(mapA, cover(uv(), viewport, sizeA)).level(5).rgb;
      const softB = texture(mapB, cover(uv(), viewport, sizeB)).level(5).rgb;
      return vec4(mix(softA, softB, smoothstep(0.3, 0.7, progress)).mul(0.8), 1);
    })();
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialBackdrop);
    backdrop.renderOrder = 0;

    // The current image, wherever its pixel hasn't left yet
    const materialA = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialA.colorNode = Fn(() => {
      const cell = floor(uv().mul(viewport).div(cellSize));
      Discard(flight(cellAt(cell).r).greaterThan(0));
      return vec4(texture(mapA, cover(uv(), viewport, sizeA)).rgb, 1);
    })();
    const planeA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialA);
    planeA.renderOrder = 1;

    // The next image, wherever its pixel has landed
    const materialB = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialB.colorNode = Fn(() => {
      const cell = floor(uv().mul(viewport).div(cellSize));
      Discard(flight(cellAt(cell).g).lessThan(1));
      return vec4(texture(mapB, cover(uv(), viewport, sizeB)).rgb, 1);
    })();
    const planeB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialB);
    planeB.renderOrder = 2;

    // The pixels in flight: one sprite per cell of the current image
    const materialPixels = new THREE.SpriteNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const index = float(instanceIndex);
    const row = floor(index.add(0.5).div(grid.x));
    const start = vec2(index.sub(row.mul(grid.x)), row);
    const data = cellAt(start);
    const t = flight(data.r);
    const end = floor(data.ba.mul(grid));
    const toPixels = (cell) => cell.add(0.5).mul(cellSize).sub(viewport.mul(0.5));
    const from = toPixels(start);
    const to = toPixels(end);
    // Easing in and out, on a soft curve to one side, its own way for each pixel
    const eased = t.mul(t).mul(t.mul(-2).add(3));
    const route = to.sub(from);
    const side = vec2(route.y.negate(), route.x);
    const bend = hash(index.add(11)).sub(0.5).mul(0.8);
    const swirl = sin(t.mul(PI)).mul(bend);
    materialPixels.positionNode = vec3(mix(from, to, eased).add(side.mul(swirl)), 0);
    // Square in place at both ends (so it hands over to the images), a soft dot in flight
    const loose = sin(t.mul(PI));
    materialPixels.scaleNode = select(
      t.greaterThan(0).and(t.lessThan(1)),
      cellSize.mul(mix(1, 0.8, loose)),
      0
    );
    const colourFrom = texture(mapA, cover(start.add(0.5).div(grid), viewport, sizeA)).level(level).rgb;
    const colourTo = texture(mapB, cover(end.add(0.5).div(grid), viewport, sizeB)).level(level).rgb;
    materialPixels.colorNode = varying(mix(colourFrom, colourTo, smoothstep(0.25, 0.75, t)));
    const vLoose = varying(loose);
    const radius = mix(0.75, 0.5, vLoose);
    materialPixels.opacityNode = smoothstep(radius.sub(0.12), radius, length(uv().sub(0.5))).oneMinus();
    const pixels = new THREE.Sprite(materialPixels);
    pixels.renderOrder = 3;
    pixels.frustumCulled = false;
    this.pixels = pixels;

    this.stage.scene.add(backdrop, planeA, planeB, pixels);

    // A grid of 3+ px cells, about 90,000 at most
    this.stage.onResize = (width, height) => {
      backdrop.scale.set(width, height, 1);
      planeA.scale.set(width, height, 1);
      planeB.scale.set(width, height, 1);
      const size = Math.max(3, Math.round(Math.sqrt((width * height) / 90000)));
      cellSize.value = size;
      grid.value.set(Math.ceil(width / size), Math.ceil(height / size));
      pixels.count = grid.value.x * grid.value.y;
      // How many texels of an image one cell covers, as a mipmap level
      const { width: w, height: h } = textures[0].image;
      level.value = Math.log2(Math.max(1, size / Math.max(width / w, height / h)));
    };
    this.stage.onResize(this.stage.viewport.value.x, this.stage.viewport.value.y);
    this.pair(0, 1);
  }

  /**
   * Pairs every cell of one image with a cell of the other in the same band of brightness
   * (ranked, so both images have as many cells in each band), as near as it can: within a band,
   * the cells of both images are paired in their order along a Hilbert curve. Works out when
   * each pixel leaves (band by band, highlights first, give or take) and writes it all into the
   * cell data texture.
   * @param {number} from - The slide the pixels leave.
   * @param {number} to - The slide they build.
   * @returns {void}
   */
  pair(from, to) {
    const { x: cols, y: rows } = this.uniforms.grid.value;
    const count = cols * rows;
    const tonesA = tonesOf(this.stage.textures[from].image, cols, rows);
    const tonesB = tonesOf(this.stage.textures[to].image, cols, rows);
    const n = 2 ** Math.ceil(Math.log2(Math.max(cols, rows)));
    const curve = new Uint32Array(count);
    for (let i = 0; i < count; i++) curve[i] = hilbert(n, i % cols, Math.floor(i / cols));
    // Every cell, brightest first, in both images
    const rank = (tones) => Uint32Array.from({ length: count }, (_, i) => i).sort((a, b) => tones[b] - tones[a]);
    const orderA = rank(tonesA);
    const orderB = rank(tonesB);
    const along = (a, b) => curve[a] - curve[b];
    const data = new Uint16Array(count * 4);
    const half = THREE.DataUtils.toHalfFloat;
    for (let band = 0; band < BANDS; band++) {
      const start = Math.floor((band * count) / BANDS);
      const end = Math.floor(((band + 1) * count) / BANDS);
      const bandA = orderA.subarray(start, end).sort(along);
      const bandB = orderB.subarray(start, end).sort(along);
      for (let i = 0; i < bandA.length; i++) {
        const a = bandA[i];
        const b = bandB[i];
        const delay = ((band + 2 * Math.random()) / (BANDS + 1)) * SPREAD;
        data[a * 4] = half(delay); // when the pixel in this cell leaves
        data[b * 4 + 1] = half(delay); // when the one landing in this cell arrives
        data[a * 4 + 2] = half(((b % cols) + 0.5) / cols); // where it lands
        data[a * 4 + 3] = half((Math.floor(b / cols) + 0.5) / rows);
      }
    }
    this.cellData.image = { data, width: cols, height: rows };
    this.cellData.needsUpdate = true;
  }

  /**
   * Navigate to the next slide.
   * @returns {void}
   */
  next() {
    this.navigate(NEXT);
  }

  /**
   * Navigate to the previous slide.
   * @returns {void}
   */
  prev() {
    this.navigate(PREV);
  }

  /**
   * Navigate through slides.
   * @param {number} direction - The direction to navigate. 1 for next and -1 for previous.
   * @returns {boolean} - Return false if the animation is currently running.
   */
  navigate(direction) {
    // Check if animation is already running
    if (this.isAnimating) return false;
    this.isAnimating = true;

    // Update the current slide index based on direction
    const previous = this.current;
    this.current =
      direction === 1
        ? this.current < this.slidesTotal - 1
          ? ++this.current
          : 0
        : this.current > 0
        ? --this.current
        : this.slidesTotal - 1;

    // Get the current and upcoming slides
    const currentSlide = this.DOM.slides[previous];
    const upcomingSlide = this.DOM.slides[this.current];

    // With reduced motion, or before WebGL is ready, just crossfade between the slides
    if (prefersReducedMotion.matches || !this.isReady) {
      upcomingSlide.classList.add('slide--current');
      crossfade(currentSlide, upcomingSlide, () => {
        currentSlide.classList.remove('slide--current');
        // Reset animation flag
        this.isAnimating = false;
      });
      return;
    }

    // Going next, the current image's pixels build the upcoming one (progress 0 to 1). Going back,
    // it plays in reverse: the upcoming image's pixels fly back out of the current one (1 to 0).
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);
    this.pair(first, second);

    // Draw the first frame (identical to the current slide) before showing the canvas
    const from = direction === NEXT ? 0 : 1;
    progress.value = from;
    this.stage.render();
    this.stage.show();

    // Animation sequence using GSAP
    gsap
      .timeline({
        onComplete: () => {
          // The last frame is identical to the upcoming slide, so swap the slides under the canvas and hide it
          upcomingSlide.classList.add('slide--current');
          currentSlide.classList.remove('slide--current');
          this.stage.hide();
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      .to(progress, {
        duration: 2.6,
        ease: 'none',
        value: 1 - from,
        onUpdate: () => this.stage.render(),
      });
  }

  /**
   * Puts a slide's image in one of the shader's texture slots.
   * @param {TextureNode} map - The texture slot.
   * @param {UniformNode} size - The slot's image size.
   * @param {number} index - The slide.
   * @returns {void}
   */
  setImage(map, size, index) {
    const image = this.stage.textures[index];
    map.value = image;
    size.value.set(image.image.width, image.image.height);
  }
}
