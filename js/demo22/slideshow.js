import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions
import { Stage, cover } from '../webgl/Stage.js'; // WebGL canvas over the slides
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, uv, vec4, mix, smoothstep, length, min } from 'three/tsl';
import { stir, CELLS, STEPS } from './stir.js'; // The liquid

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: the image turns liquid and is stirred. A few invisible
 * strokes drag through it like a finger through paint, so the picture is
 * pulled along in their wakes and curls up into eddies (a real fluid
 * simulation, worked out before the transition and recorded); as the liquid
 * slows, the next image settles out of the same flow and comes to rest in
 * its own place, coming through first in the wakes, where the liquid has
 * moved most. Going back rewinds it.
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
    flow: null, // Per cell: where the current image's content comes from (xy), and the next's (zw)
    mapA: null, // The current image, set up in createScene
    mapB: null, // The next one
    sizeA: uniform(new THREE.Vector2(1, 1)),
    sizeB: uniform(new THREE.Vector2(1, 1)),
  };

  /**
   * The stirring for the next transition, simulated ahead of time.
   * @type {{ record: Float32Array, cols: number, rows: number } | null}
   */
  stirring = null;

  /**
   * The stirring the current transition plays.
   * @type {{ record: Float32Array, cols: number, rows: number } | null}
   */
  playing = null;

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
      .then(() => {
        this.isReady = true;
        // Stirrings are simulated in a worker, so the page never waits for one; without it,
        // here, between transitions
        try {
          this.worker = new Worker(new URL('./stirring.worker.js', import.meta.url), {
            type: 'module',
          });
          this.worker.onmessage = ({ data }) => (this.stirring = data);
          this.worker.onerror = () => (this.worker = null);
        } catch {
          this.worker = null;
        }
        this.prepare();
      })
      .catch((error) => console.warn('WebGL unavailable, slides will crossfade.', error));
  }

  /**
   * Builds the full-screen plane that draws the transition.
   * @returns {void}
   */
  createScene() {
    const { viewport, textures } = this.stage;
    // Two different textures to start with: nodes made from the same one would share a binding
    this.uniforms.mapA = texture(textures[0]);
    this.uniforms.mapB = texture(textures[1]);
    this.flowData = new THREE.DataTexture(
      new Uint16Array(4),
      1,
      1,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    this.flowData.magFilter = this.flowData.minFilter = THREE.LinearFilter;
    this.uniforms.flow = texture(this.flowData);
    const { progress, flow, mapA, mapB, sizeA, sizeB } = this.uniforms;

    const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    material.colorNode = Fn(() => {
      const st = uv();
      // Each image read from where the liquid has carried its content (offsets are 0 for the
      // current image at the start and for the next one at the end)
      const offsets = texture(flow, st);
      const current = texture(mapA, cover(st.add(offsets.xy), viewport, sizeA)).rgb;
      const next = texture(mapB, cover(st.add(offsets.zw), viewport, sizeB)).rgb;
      // The next one comes through while the liquid is moving most, a little sooner wherever
      // it has carried the current image furthest
      const stirred = min(length(offsets.xy).mul(4), 1);
      return vec4(mix(current, next, smoothstep(0.35, 0.65, progress.add(stirred.mul(0.12)))), 1);
    })();
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.stage.scene.add(this.plane);

    // Keep the plane the size of the viewport
    this.stage.onResize = (width, height) => this.plane.scale.set(width, height, 1);
    this.stage.onResize(this.stage.viewport.value.x, this.stage.viewport.value.y);

    // Before each frame, the liquid at that moment
    this.stage.onRender = () => this.pour();
  }

  /**
   * The simulation grid for the current screen shape: about CELLS square cells.
   * @returns {{ cols: number, rows: number }}
   */
  grid() {
    const { x: width, y: height } = this.stage.viewport.value;
    const cell = Math.sqrt((width * height) / CELLS);
    return {
      cols: Math.max(8, Math.round(width / cell)),
      rows: Math.max(8, Math.round(height / cell)),
    };
  }

  /**
   * Starts simulating a new stirring for the next transition.
   * @returns {void}
   */
  prepare() {
    const { cols, rows } = this.grid();
    if (this.worker) this.worker.postMessage({ cols, rows });
    else setTimeout(() => (this.stirring = { record: stir(cols, rows), cols, rows }), 50);
  }

  /**
   * Puts the liquid's state at the current progress (between two recorded steps) in the flow
   * texture, as fractions of the screen.
   * @returns {void}
   */
  pour() {
    if (!this.playing) return;
    const { record, cols, rows } = this.playing;
    const n = cols * rows;
    const at = this.uniforms.progress.value * STEPS;
    const step = Math.min(Math.floor(at), STEPS - 1);
    const t = at - step;
    const a = step * n * 4;
    const b = a + n * 4;
    const half = THREE.DataUtils.toHalfFloat;
    const data = this.flowData.image.data;
    for (let i = 0; i < n * 4; i += 2) {
      data[i] = half((record[a + i] * (1 - t) + record[b + i] * t) / cols);
      data[i + 1] = half((record[a + i + 1] * (1 - t) + record[b + i + 1] * t) / rows);
    }
    this.flowData.needsUpdate = true;
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

    // Going next, the current image is stirred and the upcoming one settles out of it (progress
    // 0 to 1). Going back, it plays in reverse (1 to 0): the stirring unwinds.
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);
    // The stirring simulated ahead of time (or, if the screen has changed shape since, one now),
    // and a new one for next time
    const { cols, rows } = this.grid();
    const ready = this.stirring;
    this.playing =
      ready && ready.cols === cols && ready.rows === rows
        ? ready
        : { record: stir(cols, rows), cols, rows };
    this.prepare();
    this.flowData.image = { data: new Uint16Array(cols * rows * 4), width: cols, height: rows };

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
        duration: 1.2,
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
