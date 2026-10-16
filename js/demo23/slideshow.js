import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

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

    // The band the upcoming slide opens out of, across the middle (top and bottom edges, in
    // percent of the height, leaning by `lean` from one side to the other)
    const band = (top, bottom, lean) =>
      `polygon(0% ${top + lean}%, 100% ${top - lean}%, 100% ${bottom - lean}%, 0% ${bottom + lean}%)`;

    // Animation sequence using GSAP
    gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(upcomingSlide, { zIndex: 99 });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(upcomingSlide, { zIndex: 1, clipPath: 'none' });
          gsap.set(currentInner, { scale: 1, filter: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      // A narrow band opens across the middle, leaning against the direction, and straightens
      .fromTo(
        upcomingSlide,
        {
          clipPath: band(50, 50, direction * 5),
        },
        {
          duration: 0.8,
          ease: 'power3.out',
          clipPath: band(39, 61, 0),
        },
        'start'
      )
      // Then it opens all the way
      .to(
        upcomingSlide,
        {
          duration: 1,
          ease: 'power4.inOut',
          clipPath: band(0, 100, 0),
        },
        'start+=0.55'
      )
      // The upcoming image settles inside it
      .fromTo(
        upcomingInner,
        {
          scale: 1.4,
          yPercent: direction * 6,
        },
        {
          duration: 1.6,
          ease: 'expo.inOut',
          scale: 1,
          yPercent: 0,
        },
        'start'
      )
      // The current image is pushed back, darkening
      .fromTo(
        currentInner,
        {
          scale: 1,
          filter: 'brightness(100%)',
        },
        {
          duration: 1.55,
          ease: 'power3.inOut',
          scale: 1.15,
          filter: 'brightness(35%)',
        },
        'start'
      );
  }
}
