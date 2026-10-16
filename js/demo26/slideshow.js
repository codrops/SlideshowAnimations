import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How many columns the upcoming image rises in */
const COLUMNS = 5;

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
    pieces: null, // Columns of each slide's image, set up in the constructor
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

    // Cut each slide's image into pieces (copies of it, each to be clipped to its part)
    this.DOM.pieces = this.DOM.slidesInner.map((inner) =>
      Array.from({ length: COLUMNS }, () => {
        const piece = document.createElement('div');
        piece.className = 'slide__piece';
        piece.style.backgroundImage = inner.style.backgroundImage;
        inner.parentNode.appendChild(piece);
        return piece;
      })
    );
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

    // The upcoming image rises in columns, from below going next and from above going back, the
    // middle ones first, while the current image is pushed back and darkens
    const columns = this.DOM.pieces[this.current];
    const middle = (COLUMNS - 1) / 2;

    // Animation sequence using GSAP
    const timeline = gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current, its image showing in columns
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(upcomingSlide, { zIndex: 99 });
          gsap.set(upcomingInner, { opacity: 0 });
          columns.forEach((column, i) =>
            gsap.set(column, {
              opacity: 1,
              clipPath: `inset(0% ${100 - ((i + 1) * 100) / COLUMNS}% 0% ${(i * 100) / COLUMNS}%)`,
            })
          );
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(upcomingSlide, { zIndex: 1 });
          gsap.set(upcomingInner, { opacity: 1 });
          gsap.set(columns, { opacity: 0, yPercent: 0 });
          gsap.set(currentInner, { scale: 1, filter: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      .fromTo(
        currentInner,
        {
          scale: 1,
          filter: 'brightness(100%)',
        },
        {
          duration: 1.4,
          ease: 'power3.inOut',
          scale: 1.1,
          filter: 'brightness(40%)',
        },
        'start'
      );

    columns.forEach((column, i) => {
      timeline.fromTo(
        column,
        {
          yPercent: direction * 100,
        },
        {
          duration: 1.1,
          ease: 'expo.inOut',
          yPercent: 0,
        },
        `start+=${Math.abs(i - middle) * 0.09}`
      );
    });
  }
}
