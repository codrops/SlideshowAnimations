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
    pieces: null, // The two halves each slide's image splits into, set up in the constructor
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
      Array.from({ length: 2 }, () => {
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

    // The current image is cut along a slanting line and its two halves shear apart, one up and
    // one down (the other way round going back), uncovering the upcoming image as it settles
    const [left, right] = this.DOM.pieces[previous];

    // Animation sequence using GSAP
    gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current, under the current one, which
          // shows in two halves
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(currentSlide, { zIndex: 99 });
          gsap.set(currentInner, { opacity: 0 });
          gsap.set(left, { opacity: 1, clipPath: 'polygon(0% 0%, 62% 0%, 38% 100%, 0% 100%)' });
          gsap.set(right, { opacity: 1, clipPath: 'polygon(62% 0%, 100% 0%, 100% 100%, 38% 100%)' });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(currentSlide, { zIndex: 1 });
          gsap.set(currentInner, { opacity: 1 });
          gsap.set([left, right], { opacity: 0, xPercent: 0, yPercent: 0 });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      // The halves slide along the cut, out of the screen
      .to(
        left,
        {
          duration: 1.2,
          ease: 'power4.inOut',
          xPercent: direction * 24,
          yPercent: -direction * 100,
        },
        'start'
      )
      .to(
        right,
        {
          duration: 1.2,
          ease: 'power4.inOut',
          xPercent: -direction * 24,
          yPercent: direction * 100,
        },
        'start+=0.06'
      )
      // The upcoming image settles underneath
      .fromTo(
        upcomingInner,
        {
          scale: 1.25,
          filter: 'brightness(60%)',
        },
        {
          duration: 1.4,
          ease: 'expo.inOut',
          scale: 1,
          filter: 'brightness(100%)',
          clearProps: 'filter',
        },
        'start'
      );
  }
}
