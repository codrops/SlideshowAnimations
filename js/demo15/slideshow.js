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
		el: null,            // Main slideshow container
        slides: null,        // Individual slides
        slidesInner: null,   // Inner content of slides (usually images)

		deco: null,			 // Empty deco element between the slides
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
		this.DOM.slidesInner = this.DOM.slides.map(item => item.querySelector('.slide__img'));
		
		// Set initial slide as current
		this.DOM.slides[this.current].classList.add('slide--current');
		
		// Count total slides
		this.slidesTotal = this.DOM.slides.length;

		// Deco element
		this.DOM.deco = this.DOM.el.querySelectorAll('.deco');
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
		if ( this.isAnimating ) return false;
		this.isAnimating = true;
		
		// Update the current slide index based on direction
		const previous = this.current;
		this.current = direction === 1 ? 
						this.current < this.slidesTotal - 1 ? ++this.current : 0 :
						this.current > 0 ? --this.current : this.slidesTotal - 1

		// Get the current and upcoming slides and their inner elements
		const currentSlide = this.DOM.slides[previous];
		const currentInner = this.DOM.slidesInner[previous];
		const upcomingSlide = this.DOM.slides[this.current];
		const upcomingInner = this.DOM.slidesInner[this.current];
		
		// Animation sequence using GSAP
		gsap
		.timeline({
			defaults: {
				duration: 0.8,
				ease: 'power3.inOut'
			},
			onComplete: () => {
				// Reset animation flag
                this.isAnimating = false;
			}
		})
		// Defining animation steps
		.addLabel('start', 0)

		.fromTo(this.DOM.deco, {
			yPercent: pos => pos ? -100 : 100,
			autoAlpha: 1
		}, {
			yPercent: pos => pos ? -50 : 50
		}, 'start')
		.to(currentSlide, {
			scale: 1.1,
			rotation: direction*2
		}, 'start')

		.addLabel('middle', '>')
		.add(() => {
			// Remove class from the previous slide to unmark it as current
			this.DOM.slides[previous].classList.remove('slide--current');
			// Add class to the upcoming slide to mark it as current
			this.DOM.slides[this.current].classList.add('slide--current');
		}, 'middle')
		.to(this.DOM.deco, {
			duration: 1.1,
			ease: 'expo',
			yPercent: pos => pos ? -100 : 100
		}, 'middle')
		
		.fromTo(upcomingSlide, {
			scale: 1.1,
			rotation: direction*2
		}, {
			duration: 1.1,
			ease: 'expo',
			scale: 1,
			rotation: 0
		}, 'middle');

	}

}