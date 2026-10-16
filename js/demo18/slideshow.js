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
  floor,
  mix,
  smoothstep,
  sin,
  pow,
  dot,
  hash,
  length,
  luminance,
  PI,
} from 'three/tsl';

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How soft the tone thresholds are: higher develops more evenly, lower more in steps */
const SOFTNESS = 0.35;
/** How far the developer wash makes some areas run ahead of others */
const WASH = 0.14;
/** The photographic paper */
const PAPER = [0.94, 0.92, 0.88];
/** The darkroom's safelight */
const SAFELIGHT = [0.95, 0.5, 0.4];

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: a darkroom. The current photograph bleaches out to blank
 * paper, its brightest tones first and its deepest shadows last, then the
 * next one develops on the paper the way a print does in the tray: shadows
 * first, then the midtones, the highlights last. The developer washes over it
 * unevenly as the tray rocks, so some areas come up before others, and the
 * whole time it's under the red glow of a safelight, with the paper's grain,
 * until the print is done and the light clears. Going back rewinds it.
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
    progress: uniform(0), // 0 = the current photograph, 1 = the next one, developed
    seed: uniform(0), // A different wash every time
    mapA: null, // The photograph that bleaches, set up in createScene
    mapB: null, // The one that develops
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
    const { progress, seed, mapA, mapB, sizeA, sizeB } = this.uniforms;

    const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });

    material.colorNode = Fn(() => {
      const st = uv();
      const p = st.sub(0.5).mul(vec2(viewport.x.div(viewport.y), 1));
      const phase = seed.mul(2 * Math.PI);
      const paper = vec3(...PAPER);

      // The developer doesn't reach everywhere at once: large soft areas run a little ahead
      // or behind, and they shift as the tray rocks
      const rock = progress.mul(2.5);
      const wash = sin(p.x.mul(2.1).add(p.y.mul(1.3)).add(phase).add(rock))
        .mul(0.6)
        .add(sin(p.x.mul(-1.2).add(p.y.mul(2.7)).add(phase.mul(1.7)).sub(rock.mul(0.7))).mul(0.4))
        .mul(WASH);

      // Bleaching, over the first 55%: a tone goes once the level passes it, brightest first.
      // The level runs from below every tone to above all of them, so it starts and ends clean.
      const span = 1 + SOFTNESS + WASH * 2;
      const bleachLevel = progress.div(0.55).clamp(0, 1).mul(span).sub(WASH).add(wash);
      const current = texture(mapA, cover(st, viewport, sizeA)).rgb;
      const bleached = smoothstep(0, SOFTNESS, bleachLevel.sub(luminance(current).oneMinus()));
      const fading = mix(current, paper, bleached);

      // Developing, over the last 55%: a tone comes up once the level passes it, darkest first
      const developLevel = progress.sub(0.45).div(0.55).clamp(0, 1).mul(span).sub(WASH).add(wash.negate());
      const next = texture(mapB, cover(st, viewport, sizeB)).rgb;
      const developed = smoothstep(0, SOFTNESS, developLevel.sub(luminance(next)));
      const print = mix(fading, next, developed);

      // The darkroom, strongest in the middle and gone at both ends
      const dark = pow(sin(progress.mul(PI)).max(0), 1.5);
      // the paper's grain,
      const grain = hash(dot(floor(st.mul(viewport)), vec2(1, 4093))).sub(0.5).mul(0.05);
      // the corners falling off into the dark,
      const vignette = smoothstep(0.35, 1.1, length(p)).mul(0.45);
      // and the red safelight over everything
      const lit = print
        .add(grain)
        .mul(vignette.oneMinus())
        .mul(vec3(...SAFELIGHT));

      return vec4(mix(print, lit, dark), 1);
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

    // Going next, the current photograph bleaches and the upcoming one develops (progress 0 to 1).
    // Going back, it plays in reverse (1 to 0).
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);
    this.uniforms.seed.value = Math.random();

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
