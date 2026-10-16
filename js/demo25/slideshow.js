import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How small the upcoming image starts, as a picture in the middle of the current one */
const SMALL = 0.2;

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

    // Going next, the view dives into the upcoming image, set like a small picture in the middle
    // of the current one: both grow by the same factor, so the picture stays put in the current
    // image until it fills the screen. Going back, it pulls out of the current image, which
    // shrinks into a small picture in the middle of the previous one and closes.
    const timeline = gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(direction === NEXT ? upcomingSlide : currentSlide, { zIndex: 99 });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set([currentSlide, upcomingSlide], { zIndex: 1, scale: 1, clipPath: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0);

    if (direction === NEXT) {
      timeline
        // The small picture opens in the middle
        .fromTo(
          upcomingSlide,
          {
            scale: SMALL,
            clipPath: 'inset(50% 50% 50% 50%)',
          },
          {
            duration: 0.6,
            ease: 'power3.out',
            clipPath: 'inset(0% 0% 0% 0%)',
          },
          'start'
        )
        // and the view dives into it
        .to(
          upcomingSlide,
          {
            duration: 1.3,
            ease: 'expo.inOut',
            scale: 1,
          },
          'start+=0.4'
        )
        .fromTo(
          currentSlide,
          {
            scale: 1,
          },
          {
            duration: 1.3,
            ease: 'expo.inOut',
            scale: 1 / SMALL,
          },
          'start+=0.4'
        );
    } else {
      timeline
        // The view pulls out of the current image
        .fromTo(
          upcomingSlide,
          {
            scale: 1 / SMALL,
          },
          {
            duration: 1.3,
            ease: 'expo.inOut',
            scale: 1,
          },
          'start'
        )
        .fromTo(
          currentSlide,
          {
            scale: 1,
          },
          {
            duration: 1.3,
            ease: 'expo.inOut',
            scale: SMALL,
          },
          'start'
        )
        // which closes, a small picture in the middle of the previous one
        .fromTo(
          currentSlide,
          {
            clipPath: 'inset(0% 0% 0% 0%)',
          },
          {
            duration: 0.55,
            ease: 'power2.in',
            clipPath: 'inset(50% 50% 50% 50%)',
          },
          'start+=0.85'
        );
    }
  }
}
