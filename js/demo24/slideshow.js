import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/** How far the view pulls back (the slides' scale), and the gap between slides (percent of their width) */
const ZOOM = 0.6;
const GAP = 6;

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

    // A camera over the slides, laid out side by side (the upcoming one next to the current, on
    // the side it comes from): it pulls back, pans across and pushes in again
    const camera = { zoom: 1, pan: 0 };
    const spacing = 100 + GAP;
    const place = () => {
      [
        [currentSlide, currentInner, 0],
        [upcomingSlide, upcomingInner, direction * spacing],
      ].forEach(([slide, inner, at]) => {
        const x = (at - camera.pan) * camera.zoom;
        gsap.set(slide, { xPercent: x, scale: camera.zoom });
        // The images shift a little inside their frames as they travel (enlarged as the view
        // pulls back, so they still fill them)
        gsap.set(inner, { xPercent: -x * 0.1, scale: 1 + (1 - camera.zoom) * 0.6 });
      });
    };

    // Animation sequence using GSAP
    gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current
          this.DOM.slides[this.current].classList.add('slide--current');
        },
        onUpdate: place,
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set([currentSlide, upcomingSlide, currentInner, upcomingInner], { clearProps: 'transform' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0)
      // The view pulls back
      .to(
        camera,
        {
          duration: 0.8,
          ease: 'power3.inOut',
          zoom: ZOOM,
        },
        'start'
      )
      // pans across to the upcoming slide
      .to(
        camera,
        {
          duration: 1.1,
          ease: 'power3.inOut',
          pan: direction * spacing,
        },
        'start+=0.35'
      )
      // and pushes in on it
      .to(
        camera,
        {
          duration: 0.8,
          ease: 'power3.inOut',
          zoom: 1,
        },
        'start+=1.05'
      );
  }
}
