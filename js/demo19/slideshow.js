import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions
import { Stage, cover } from '../webgl/Stage.js'; // WebGL canvas over the slides
import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  texture,
  uv,
  vec3,
  vec4,
  mix,
  smoothstep,
  select,
  sin,
  luminance,
} from 'three/tsl';

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** The two inks, from the demo's own palette (the deco colours in css/base.css). THREE.Color
 * turns the sRGB hex values into the linear values the shader works in. */
const INK = new THREE.Color(0x1c1a1a);
const PAPER = new THREE.Color(0xd4503e);

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: a two-tone print. The current image sinks into two flat
 * colours, near-black ink on vermilion (from the demo's own palette), its
 * shapes cut from its tones; the shapes then flow into the next image's,
 * cut from a blend of the two images' tones that shifts from one to the
 * other, and the next image's own colour comes back. Going back rewinds it.
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
    mapA: null, // The current image, set up in createScene
    mapB: null, // The next one
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
   * Builds the full-screen plane that draws the transition.
   * @returns {void}
   */
  createScene() {
    const { viewport, textures } = this.stage;
    // Two different textures to start with: nodes made from the same one would share a binding
    this.uniforms.mapA = texture(textures[0]);
    this.uniforms.mapB = texture(textures[1]);
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;

    const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });

    material.colorNode = Fn(() => {
      const st = uv();
      const current = texture(mapA, cover(st, viewport, sizeA)).rgb;
      const next = texture(mapB, cover(st, viewport, sizeB)).rgb;

      // The tones the print is cut from: each image's, a little softened so the shapes are
      // clean, blending from the current image's to the next one's
      const toneA = luminance(texture(mapA, cover(st, viewport, sizeA)).level(1.5).rgb);
      const toneB = luminance(texture(mapB, cover(st, viewport, sizeB)).level(1.5).rgb);
      const blend = smoothstep(0.3, 0.7, progress);
      const tone = mix(toneA, toneB, blend);
      // Where the ink stops: at each image's own average tone (its smallest mipmap), so every
      // print splits into ink and paper, breathing a little as the shapes change
      const averageA = luminance(texture(mapA, cover(st, viewport, sizeA)).level(12).rgb);
      const averageB = luminance(texture(mapB, cover(st, viewport, sizeB)).level(12).rgb);
      const cut = mix(averageA, averageB, blend).add(sin(progress.mul(Math.PI * 2)).mul(0.03));
      const ink = vec3(INK.r, INK.g, INK.b);
      const paper = vec3(PAPER.r, PAPER.g, PAPER.b);
      const print = mix(ink, paper, smoothstep(cut.sub(0.02), cut.add(0.02), tone));

      // In and out of the print: the photographs at either end, the print in between
      const printed = smoothstep(0, 0.22, progress).mul(smoothstep(0.78, 1, progress).oneMinus());
      const photo = select(progress.lessThan(0.5), current, next);
      return vec4(mix(photo, print, printed), 1);
    })();

    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.stage.scene.add(this.plane);

    // Keep the plane the size of the viewport
    this.stage.onResize = (width, height) => this.plane.scale.set(width, height, 1);
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

    // Going next, the current image prints and turns into the upcoming one (progress 0 to 1).
    // Going back, it plays in reverse (1 to 0).
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);


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
        duration: 2,
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
