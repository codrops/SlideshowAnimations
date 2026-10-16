import { preloadImages } from '../utils.js'; // Utility function to preload images
import { Slideshow } from './slideshow.js';

const slides = document.querySelector('.slides');
const slideshow = new Slideshow(slides);

document
  .querySelector('.slides-nav__item--prev')
  .addEventListener('click', () => slideshow.prev());
document
  .querySelector('.slides-nav__item--next')
  .addEventListener('click', () => slideshow.next());
// One gesture moves one slide. After a flick, a trackpad keeps sending wheel
// events (its momentum), weaker and weaker, for a second or two: those are
// ignored. A new flick counts even before that momentum has died down (it comes
// in clearly stronger than the fading events before it), and so does any
// movement after a pause. A gesture that comes while a transition is running
// moves a slide as soon as the transition is over, if it's still going.
let fresh = true; // Whether the current gesture can still move a slide
let lastWheel = 0; // When the last wheel event came
let strength = 0; // How strong it was
let peak = 0; // The strongest wheel event of the current gesture
window.addEventListener(
  'wheel',
  (event) => {
    const now = performance.now();
    const current = Math.abs(event.deltaX) + Math.abs(event.deltaY);
    const fading = strength < peak * 0.6;
    if (now - lastWheel > 200 || (fading && current > strength * 1.5 + 4)) {
      fresh = true;
      peak = 0;
    }
    peak = Math.max(peak, current);
    strength = current;
    lastWheel = now;
  },
  { capture: true, passive: true }
);
const move = (step) => {
  if (!fresh || slideshow.isAnimating) return;
  fresh = false;
  step();
};

// Initialize the GSAP Observer plugin.
Observer.create({
  type: 'wheel,touch,pointer',
  onDown: () => move(() => slideshow.prev()),
  onUp: () => move(() => slideshow.next()),
  // Every touch or drag is a new gesture
  onPress: () => (fresh = true),
  // invert the mouse wheel delta
  wheelSpeed: -1,
  tolerance: 10,
});

// Allow navigating with the arrow keys
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') slideshow.prev();
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') slideshow.next();
});

// Preload all images and fonts. Once they are ready, remove the 'loading' class from the body.
Promise.all([preloadImages('.slide__img'), document.fonts.ready]).then(() =>
  document.body.classList.remove('loading')
);
