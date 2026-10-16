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
  hash,
  length,
  varying,
  instanceIndex,
  Discard,
  mx_noise_float,
  mx_noise_vec3,
} from 'three/tsl';

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** Grains leave between 0 and SPREAD, and fly for LIFE, both in progress units */
const SPREAD = 1.38;
const LIFE = 0.5;

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: the image erodes into grains of sand. The wind picks them
 * up from the bottom left, in patches and one grain at a time, and carries
 * them up and across, swirling and lifting towards the viewer, while the new
 * image settles underneath. Going back plays it in reverse: the sand blows
 * back in and settles into the previous image.
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
    progress: uniform(0), // 0 = the image made of sand, 1 = the image underneath
    seed: uniform(0), // A new pattern for every transition
    cellSize: uniform(4), // One grain per cell, in CSS pixels
    cols: uniform(1), // Cells across
    level: uniform(0), // Mipmap level that averages one cell of the image
    mapA: null, // The image made of sand, set up in createScene
    mapB: null, // The image underneath
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
    this.DOM.slidesInner = this.DOM.slides.map((item) => item.querySelector('.slide__img'));

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
   * Builds the two image planes and the grains.
   * @returns {void}
   */
  createScene() {
    const { viewport, textures } = this.stage;
    // Two different textures to start with: nodes made from the same one would share a binding
    this.uniforms.mapA = texture(textures[0]);
    this.uniforms.mapB = texture(textures[1]);
    const { progress, seed, cellSize, cols, level, mapA, mapB, sizeA, sizeB } = this.uniforms;

    // When a cell's grain leaves: 0 = still in place, 1 = gone. The plane holding the
    // grains in place and the grains in flight both use it, so they hand over exactly.
    const flight = Fn(([cell, index]) => {
      const st = cell.add(0.5).mul(cellSize).div(viewport);
      const p = st.sub(0.5).mul(vec2(viewport.x.div(viewport.y), 1));
      // The wind starts in the bottom left corner and works its way up and across,
      const along = st.x.mul(0.6).add(st.y.mul(0.4));
      // in patches, the way sand comes off a dune,
      const patches = mx_noise_float(vec3(p.mul(3), seed.mul(0.173))).mul(0.12);
      // and one grain at a time
      const loose = hash(index.add(seed.mul(7919))).mul(0.14);
      const delay = along.add(patches).add(loose).add(0.12).clamp(0, SPREAD);
      return progress
        .mul(SPREAD + LIFE)
        .sub(delay)
        .div(LIFE)
        .clamp(0, 1);
    });

    // The image underneath settles as the sand clears: from a little closer, and darker
    const materialB = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialB.colorNode = Fn(() => {
      const settle = progress.oneMinus().pow(2);
      const st = uv().sub(0.5).div(settle.mul(0.06).add(1)).add(0.5);
      return vec4(texture(mapB, cover(st, viewport, sizeB)).rgb.mul(settle.mul(0.3).oneMinus()), 1);
    })();

    // The image made of sand, with a hole wherever a grain has left
    const materialA = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialA.colorNode = Fn(() => {
      const cell = floor(uv().mul(viewport).div(cellSize));
      Discard(flight(cell, cell.y.mul(cols).add(cell.x)).greaterThan(0));
      return vec4(texture(mapA, cover(uv(), viewport, sizeA)).rgb, 1);
    })();

    // The grains: one sprite per cell, drawn only once it has left
    const materialG = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const index = float(instanceIndex);
    const row = floor(index.add(0.5).div(cols));
    const cell = vec2(index.sub(row.mul(cols)), row);
    const t = flight(cell, index);
    const centre = cell.add(0.5).mul(cellSize).sub(viewport.mul(0.5));
    const random = vec3(
      hash(index.mul(3).add(1)),
      hash(index.mul(3).add(2)),
      hash(index.mul(3).add(3)),
    );

    // Grains pick up speed as the wind takes them,
    const e = t.mul(t);
    // carried up and across, each at its own speed,
    const gust = vec3(0.82, 0.57, 0).mul(viewport.y).mul(random.x.mul(0.8).add(0.5));
    // swirling on the way
    const swirl = mx_noise_vec3(vec3(centre.mul(0.004), e.mul(1.6).add(seed.mul(0.173)))).mul(180);
    // and lifting towards the viewer
    const lift = vec3(0, 0, random.y.mul(400).add(80));
    materialG.positionNode = vec3(centre, 0).add(gust.add(swirl).add(lift).mul(e));

    // A grain leaves as a square of its cell, then shrinks to its own size and fades out
    const loose = smoothstep(0, 0.3, t);
    const size = mix(1, random.z.mul(0.5).add(0.45), loose).mul(smoothstep(0.7, 1, t).oneMinus());
    materialG.scaleNode = select(t.greaterThan(0), cellSize.mul(size), 0);

    // Its colour is its cell's average, catching the light a little differently as it tumbles
    const average = texture(
      mapA,
      cover(cell.add(0.5).mul(cellSize).div(viewport), viewport, sizeA),
    ).level(level).rgb;
    materialG.colorNode = varying(average.mul(mix(1, random.x.mul(0.4).add(0.8), loose)));
    // and it rounds off as it goes
    const tv = varying(t);
    const radius = mix(0.8, 0.5, smoothstep(0, 0.3, tv));
    const round = smoothstep(radius.sub(0.08), radius, length(uv().sub(0.5))).oneMinus();
    materialG.opacityNode = round.mul(smoothstep(0.75, 1, tv).oneMinus());

    this.planeB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialB);
    this.planeA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialA);
    this.grains = new THREE.Sprite(materialG);
    this.planeB.renderOrder = 0;
    this.planeA.renderOrder = 1;
    this.grains.renderOrder = 2;
    this.grains.frustumCulled = false;
    this.stage.scene.add(this.planeB, this.planeA, this.grains);

    // Keep the planes the size of the viewport, and the grains about 110,000 at most
    this.stage.onResize = (width, height) => {
      this.planeA.scale.set(width, height, 1);
      this.planeB.scale.set(width, height, 1);
      const size = Math.max(3, Math.round(Math.sqrt((width * height) / 110000)));
      const across = Math.ceil(width / size);
      const down = Math.ceil(height / size);
      cellSize.value = size;
      cols.value = across;
      this.grains.count = across * down;
      // How many texels of the image a cell covers, as a mipmap level
      const { width: imageWidth, height: imageHeight } = textures[0].image;
      const scale = Math.max(width / imageWidth, height / imageHeight);
      level.value = Math.log2(Math.max(1, size / scale));
    };
    this.stage.onResize(this.stage.viewport.value.x, this.stage.viewport.value.y);
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

    // Going next, the current image blows away (progress 0 to 1). Going back, it plays in
    // reverse: the upcoming image is the sand, blowing back in (1 to 0).
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);
    this.uniforms.seed.value = Math.floor(Math.random() * 1000);

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
        duration: 1.4,
        ease: 'sine.inOut',
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
