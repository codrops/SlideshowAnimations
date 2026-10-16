import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How far the view pulls back as the cube turns, and the perspective (CSS pixels) */
const PULL = 0.8;
const PERSPECTIVE = 2400;

/**
 * Slideshow Class
 * Manages slideshow functionality including navigation and animations.
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

    // Get the current and upcoming slides and their inner elements
    const currentSlide = this.DOM.slides[previous];
    const currentInner = this.DOM.slidesInner[previous];
    const upcomingSlide = this.DOM.slides[this.current];
    const upcomingInner = this.DOM.slidesInner[this.current];

    // With reduced motion, just crossfade between the slides
    if (prefersReducedMotion.matches) {
      upcomingSlide.classList.add('slide--current');
      crossfade(currentSlide, upcomingSlide, () => {
        currentSlide.classList.remove('slide--current');
        // Reset animation flag
        this.isAnimating = false;
      });
      return;
    }

    // The two slides turn as two faces of a cube, around its middle (half the screen's width
    // behind it), to the left going next and to the right going back, the view pulling back a
    // little mid-turn, and each face darkening as it turns away
    const depth = this.DOM.el.offsetWidth / 2;
    const faces = [currentSlide, upcomingSlide];

    // Animation sequence using GSAP
    gsap
      .timeline({
        defaults: {
          duration: 1.3,
          ease: 'power3.inOut',
        },
        onStart: () => {
          // Add class to the upcoming slide to mark it as current
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(faces, {
            transformOrigin: `50% 50% ${-depth}px`,
            transformPerspective: PERSPECTIVE,
            backfaceVisibility: 'hidden',
          });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(faces, { clearProps: 'transform,transformOrigin,backfaceVisibility' });
          gsap.set([currentInner, upcomingInner], { filter: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      .fromTo(
        currentSlide,
        {
          rotationY: 0,
        },
        {
          rotationY: -direction * 90,
        },
        'start'
      )
      .fromTo(
        upcomingSlide,
        {
          rotationY: direction * 90,
        },
        {
          rotationY: 0,
        },
        'start'
      )
      .fromTo(
        currentInner,
        {
          filter: 'brightness(100%)',
        },
        {
          filter: 'brightness(30%)',
        },
        'start'
      )
      .fromTo(
        upcomingInner,
        {
          filter: 'brightness(30%)',
        },
        {
          filter: 'brightness(100%)',
        },
        'start'
      )
      // The view pulls back and comes in again
      .to(
        faces,
        {
          duration: 0.65,
          ease: 'power2.inOut',
          scale: PULL,
          yoyo: true,
          repeat: 1,
        },
        'start'
      );
  }
}
