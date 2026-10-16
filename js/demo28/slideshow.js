import { prefersReducedMotion, crossfade } from '../utils.js'; // Utility functions

/** Direction constants */
const NEXT = 1;
const PREV = -1;

/**
 * The quarters of an image: their part (a little past the middle, so no hairline shows where
 * they meet), and the corner they fly in from or out to
 */
const QUARTERS = [
  { clip: 'inset(0% 49.5% 49.5% 0%)', x: -1, y: -1 },
  { clip: 'inset(0% 0% 49.5% 49.5%)', x: 1, y: -1 },
  { clip: 'inset(49.5% 49.5% 0% 0%)', x: -1, y: 1 },
  { clip: 'inset(49.5% 0% 0% 49.5%)', x: 1, y: 1 },
];

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
    pieces: null, // The quarters of each slide's image, set up in the constructor
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

    // Cut each slide's image into quarters (copies of it, each clipped to its quarter)
    this.DOM.pieces = this.DOM.slidesInner.map((inner) =>
      QUARTERS.map(({ clip }) => {
        const piece = document.createElement('div');
        piece.className = 'slide__piece';
        piece.style.backgroundImage = inner.style.backgroundImage;
        piece.style.clipPath = clip;
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

    // Going next, the upcoming image arrives in quarters that fly in from the four corners and
    // lock together, while the current one is pushed back and darkens. Going back, the current
    // image breaks into quarters that fly out to the corners, uncovering the previous one.
    const forward = direction === NEXT;
    const [slide, inner] = forward ? [upcomingSlide, upcomingInner] : [currentSlide, currentInner];
    const quarters = this.DOM.pieces[forward ? this.current : previous];
    const away = (i) => ({ xPercent: QUARTERS[i].x * 50, yPercent: QUARTERS[i].y * 50 });
    const home = { xPercent: 0, yPercent: 0 };

    // Animation sequence using GSAP
    const timeline = gsap
      .timeline({
        onStart: () => {
          // Add class to the upcoming slide to mark it as current; the image that moves shows in
          // quarters
          this.DOM.slides[this.current].classList.add('slide--current');
          gsap.set(slide, { zIndex: 99 });
          gsap.set(inner, { opacity: 0 });
          gsap.set(quarters, { opacity: 1 });
        },
        onComplete: () => {
          // Remove class from the previous slide to unmark it as current
          this.DOM.slides[previous].classList.remove('slide--current');
          gsap.set(slide, { zIndex: 1 });
          gsap.set(inner, { opacity: 1 });
          gsap.set(quarters, { opacity: 0, ...home });
          gsap.set([currentInner, upcomingInner], { scale: 1, filter: 'none' });
          // Reset animation flag
          this.isAnimating = false;
        },
      })
      // Defining animation steps
      .addLabel('start', 0);

    quarters.forEach((quarter, i) => {
      timeline.fromTo(
        quarter,
        forward ? away(i) : home,
        {
          duration: 1.2,
          ease: 'expo.inOut',
          ...(forward ? home : away(i)),
        },
        'start'
      );
    });

    // The image that stays still: pushed back going next, coming forward going back
    timeline.fromTo(
      forward ? currentInner : upcomingInner,
      {
        scale: forward ? 1 : 1.1,
        filter: forward ? 'brightness(100%)' : 'brightness(40%)',
      },
      {
        duration: 1.3,
        ease: 'power3.inOut',
        scale: forward ? 1.1 : 1,
        filter: forward ? 'brightness(40%)' : 'brightness(100%)',
      },
      'start'
    );
  }
}
