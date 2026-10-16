import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How deep the chevron is, and how far the deco runs ahead of the image (percent of the width) */
const POINT = 18;
const LEAD = 12;

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
    deco: null, // Deco element that leads the upcoming slide
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

    // Get the deco element
    this.DOM.deco = this.DOM.el.querySelector('.deco');
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

    // A chevron pointing the way the slides travel (the upcoming one comes from the right going
    // next, from the left going back), from its tip at `at` (percent of the width): the deco runs
    // across first, and the upcoming image follows close behind it
    const chevron = (at) =>
      direction === NEXT
        ? `polygon(${at + POINT}% 0%, 200% 0%, 200% 100%, ${at + POINT}% 100%, ${at}% 50%)`
        : `polygon(-100% 0%, ${at - POINT}% 0%, ${at}% 50%, ${at - POINT}% 100%, -100% 100%)`;
    const [from, to] = direction === NEXT ? [100, -POINT] : [0, 100 + POINT];
    const deco = this.DOM.deco;

    // Animation sequence using GSAP
    gsap
      .timeline({
        defaults: {
          duration: 1.3,
          ease: 'power4.inOut',
        },
        onStart: () => {
          // Add class to the upcoming slide to mark it as current
          this.DOM.slides[this.current].classList.add('slide--current');
          // (the deco between the two slides: above the current one, which may keep the z-index
          // of a past transition, and under the upcoming one)
          gsap.set(upcomingSlide, { zIndex: 99 });
          gsap.set(deco, { autoAlpha: 1, zIndex: 50 });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(upcomingSlide, { zIndex: 1, clipPath: 'none' });
          gsap.set(deco, { autoAlpha: 0 });
          gsap.set(currentInner, { filter: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      .fromTo(
        deco,
        {
          clipPath: chevron(from),
        },
        {
          clipPath: chevron(to),
        },
        'start'
      )
      .fromTo(
        upcomingSlide,
        {
          clipPath: chevron(from + direction * LEAD),
        },
        {
          clipPath: chevron(to),
        },
        'start+=0.1'
      )
      // The current image darkens under them
      .fromTo(
        currentInner,
        {
          filter: 'brightness(100%)',
        },
        {
          filter: 'brightness(55%)',
        },
        'start'
      );
  }
}
