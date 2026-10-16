/**
 * Preload images function
 * @param {string} selector - The CSS selector for the images to be preloaded. Default is 'img'.
 * @returns {Promise} A promise that resolves when all the images are loaded and decoded.
 */
const preloadImages = (selector = 'img') => {
    return Promise.all(
        [...document.querySelectorAll(selector)].map((el) => {
            // Elements can be <img> tags or have a CSS background image
            const src =
                el.tagName === 'IMG'
                    ? el.currentSrc || el.src
                    : getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
            if (!src) return Promise.resolve();
            const img = new Image();
            img.src = src;
            // Don't block the demo if an image fails to load
            return img.decode().catch(() => {});
        })
    );
};

/**
 * Media query for users who prefer reduced motion
 * @type {MediaQueryList}
 */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Crossfade between two slides, used instead of the full transitions with reduced motion
 * @param {HTMLElement} current - The slide that is leaving.
 * @param {HTMLElement} upcoming - The slide that is coming in.
 * @param {Function} onComplete - Called when the fade is done.
 */
const crossfade = (current, upcoming, onComplete) => {
    gsap.timeline({
        defaults: {
            duration: 0.5,
            ease: 'power1.inOut',
        },
        onComplete: () => {
            // Hand the opacity back to the stylesheet
            gsap.set([current, upcoming], { clearProps: 'opacity' });
            onComplete();
        },
    })
    .fromTo(upcoming, { opacity: 0 }, { opacity: 1 }, 0)
    .to(current, { opacity: 0 }, 0);
};

export {
    preloadImages,
    prefersReducedMotion,
    crossfade,
};
