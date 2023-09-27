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

		// Deco elements
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
		this.tl = gsap
		.timeline({
			defaults: {
				duration: 0.8,
				ease: 'power4.inOut'
			},
			onComplete: () => {
				// Reset animation flag
                this.isAnimating = false;
			}
		})
		// Defining animation steps
		.addLabel('start', 0);

		[...this.DOM.deco].forEach((_, pos, arr) => {
			const deco = arr[arr.length-1-pos];
			this.tl.fromTo(deco, {
				xPercent: _ => pos % 2 === 1 ? -100 : 100,
				autoAlpha: 1
			}, {
				xPercent: _ => pos % 2 === 1 ? -50 : 50,
				onComplete: () => {
					if ( pos === arr.length-1 ) {
						// Remove class from the previous slide to unmark it as current
						this.DOM.slides[previous].classList.remove('slide--current');
						// Add class to the upcoming slide to mark it as current
						this.DOM.slides[this.current].classList.add('slide--current');
					}
				}
			}, `start+=${Math.floor((arr.length-1-pos)/2)*0.14}`);
			if ( !pos ) {
				this.tl.addLabel('middle', '>');
			}
		});

		this.tl
		.to(currentSlide, {
			ease: 'power4.in',
			scale: 0.1,
			onComplete: () => gsap.set(currentSlide, {scale: 1})
		}, 'start');		

		[...this.DOM.deco].forEach((_, pos, arr) => {
			const deco = arr[arr.length-1-pos];
			
			this.tl.to(deco, {
				xPercent: _ => pos % 2 === 1 ? -100 : 100,
			}, `middle+=${Math.floor((pos)/2)*0.12}`)
		});

		this.tl
		.fromTo(upcomingSlide, {
			scale: 0.6
		}, {
			duration: 1.1,
			ease: 'expo',
			scale: 1
		}, '>-0.8');
		
	}

}