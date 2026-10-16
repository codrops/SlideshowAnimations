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
  mix,
  min,
  smoothstep,
  select,
  sin,
  cos,
  exp,
  pow,
  dot,
  cross,
  normalize,
  luminance,
  varying,
  frontFacing,
  positionLocal,
  PI,
} from 'three/tsl';

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
 * The transition: the image is a sheet laid over the next one. It lifts from
 * the top right corner and rolls back over itself along a soft, wavy fold,
 * catching the light as it turns and casting a shadow, and is drawn off past
 * the far corner while the next image settles underneath. Going back plays it
 * in reverse: the sheet unrolls back over, carrying the previous image.
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
    progress: uniform(0), // 0 = the sheet lies flat, 1 = it's gone
    seed: uniform(0), // A new wave in the fold for every transition
    mapA: null, // The image on the sheet, set up in createScene
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
   * Builds the image underneath and the sheet.
   * @returns {void}
   */
  createScene() {
    const { viewport, textures } = this.stage;
    // Two different textures to start with: nodes made from the same one would share a binding
    this.uniforms.mapA = texture(textures[0]);
    this.uniforms.mapB = texture(textures[1]);
    const { progress, seed, mapA, mapB, sizeA, sizeB } = this.uniforms;

    // The fold, measured from the top right corner along `across` (towards the bottom left),
    // and `along` the fold line. Every point of the screen is 0 to `reach` across.
    const corner = viewport.mul(0.5);
    const across = normalize(vec2(-1, -0.8));
    const along = vec2(across.y.negate(), across.x);
    const reach = dot(viewport.negate(), across);
    const radius = min(viewport.x, viewport.y).mul(0.11);
    // The fold sweeps from just outside the corner to where the whole sheet has rolled past
    // the far corner, so the first and last frames are the flat sheet and no sheet at all.
    const sweep = mix(reach.mul(-0.02), reach.add(radius.mul(PI)).add(reach.mul(0.02)), progress);
    // Fabric doesn't fold in a straight line: let it wave a little while it moves
    const active = sin(progress.mul(PI));
    const foldAt = Fn(([side]) =>
      sweep.add(
        sin(side.mul(9.5).div(reach).add(seed))
          .mul(0.6)
          .add(sin(side.mul(4.1).div(reach).add(seed.mul(1.9))))
          .mul(radius.mul(0.9))
          .mul(active)
      )
    );

    // Where a point of the flat sheet ends up: flat until the fold reaches it, then around a
    // cylinder of `radius` along the fold, then flat again, face down, on top of the rest
    const sheet = Fn(([p]) => {
      const x = dot(p.sub(corner), across);
      const y = dot(p.sub(corner), along);
      const past = foldAt(y).sub(x);
      const angle = past.div(radius).clamp(0, PI);
      const rolled = select(
        past.lessThan(radius.mul(PI)),
        foldAt(y).sub(radius.mul(sin(angle))),
        foldAt(y).add(past.sub(radius.mul(PI)))
      );
      const height = select(past.lessThan(radius.mul(PI)), radius.mul(cos(angle).oneMinus()), radius.mul(2));
      const lifted = past.greaterThan(0);
      const position = corner.add(across.mul(select(lifted, rolled, x))).add(along.mul(y));
      return vec3(position, select(lifted, height, 0));
    });

    // The image underneath settles as the sheet leaves: from a little closer, and darker,
    // and in the shadow of the fold
    const materialB = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
    materialB.colorNode = Fn(() => {
      const settle = progress.oneMinus().pow(2);
      const st = uv().sub(0.5).div(settle.mul(0.04).add(1)).add(0.5);
      const p = uv().mul(viewport).sub(corner);
      const open = foldAt(dot(p, along)).sub(dot(p, across)).max(0);
      const shadow = exp(open.div(radius.mul(1.3)).negate()).mul(0.5).mul(active);
      const color = texture(mapB, cover(st, viewport, sizeB)).rgb;
      return vec4(color.mul(settle.mul(0.25).oneMinus()).mul(shadow.oneMinus()), 1);
    })();

    // The sheet: a finely divided plane, bent by `sheet` in the vertex shader
    const materialA = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const flat = positionLocal.xy.mul(viewport);
    const position = sheet(flat);
    // The surface's normal from two neighbouring points, for the light
    const normal = varying(
      normalize(cross(sheet(flat.add(vec2(1, 0))).sub(position), sheet(flat.add(vec2(0, 1))).sub(position)))
    );
    // Where the point lies on the flat sheet, for the fragment shader (linear, so it interpolates exactly)
    const onSheet = varying(flat.sub(corner));
    materialA.positionNode = position;

    materialA.colorNode = Fn(() => {
      const image = texture(mapA, cover(uv(), viewport, sizeA)).rgb;
      // The back of the sheet is pale, with the print showing faintly through
      const back = mix(vec3(0.86, 0.84, 0.8), vec3(luminance(image)), 0.22);
      const facing = select(frontFacing, normalize(normal), normalize(normal).negate());
      const base = select(frontFacing, image, back);
      // Light from the top left: shade the curl and give it a soft sheen. Both are measured
      // against a flat sheet, so they vanish when it lies flat.
      const light = normalize(vec3(-0.45, 0.55, 0.7));
      const halfway = normalize(light.add(vec3(0, 0, 1)));
      const shade = dot(facing, light).sub(light.z).mul(1.1);
      const sheen = pow(dot(facing, halfway).max(0), 24).sub(pow(halfway.z, 24)).max(0).mul(0.3);
      // The flap's tip shades the sheet just ahead of it
      const x = dot(onSheet, across);
      const tip = foldAt(dot(onSheet, along)).mul(2).sub(radius.mul(PI));
      const tipShadow = select(x.greaterThan(tip), exp(x.sub(tip).div(radius.mul(0.7)).negate()), 0)
        .mul(0.35)
        .mul(active);
      return vec4(base.mul(shade.add(1)).add(sheen).mul(tipShadow.oneMinus()), 1);
    })();

    this.planeB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialB);
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 192, 120), materialA);
    this.planeB.renderOrder = 0;
    this.sheet.renderOrder = 1;
    this.sheet.frustumCulled = false;
    this.stage.scene.add(this.planeB, this.sheet);

    // Keep the image underneath the size of the viewport (the sheet scales itself in the shader)
    this.stage.onResize = (width, height) => this.planeB.scale.set(width, height, 1);
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

    // Going next, the current image is the sheet and rolls away (progress 0 to 1). Going back,
    // it plays in reverse: the upcoming image is the sheet, unrolling back over (1 to 0).
    const { progress, mapA, mapB, sizeA, sizeB } = this.uniforms;
    const [first, second] =
      direction === NEXT ? [previous, this.current] : [this.current, previous];
    this.setImage(mapA, sizeA, first);
    this.setImage(mapB, sizeB, second);
    this.uniforms.seed.value = Math.random() * 10;

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
        duration: 1.7,
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
