# AGENTS.md

Notes for coding agents working on this repo. Read [README.md](README.md) first for what the demo is.

## Setup

- There is no build step, no package.json and nothing to install. Plain HTML, CSS and ES modules.
- Serve the root with any static server (`npx serve .` or `python3 -m http.server`). ES modules don't load from `file://`.
- GSAP and its Observer plugin are vendored in `js/` and loaded as classic scripts before the module, so `gsap` and `Observer` are globals. Don't import them, and don't switch them to a CDN.
- three.js (r186, the WebGPU build with TSL) is vendored in `js/three/` for variations 17–22, which load it through an import map in their `<head>`: `three/webgpu`, `three/tsl`, and a third entry that points `three.webgpu.min.js`'s own `./three.core.js` import at `three.core.min.js`. The files are jsDelivr's minified builds; replace all three together when upgrading.
- There are no automated tests. Check a change in a browser: run the transition forwards (Next, ArrowRight) and backwards (Prev, ArrowLeft) several times, check the page at phone width, turn on reduced motion, and look at the console. For 17–22, also check with WebGPU unavailable (the WebGL 2 fallback).

## Map

| Path | What it is |
| --- | --- |
| `index.html`…`index32.html` | One page per variation (01 is `index.html`). Same markup; they differ in the `demo-<N>` body class, the title, the images, the decos and the script they load. 17–22 also have the import map. |
| `js/demo<N>/index.js` | Page start-up: creates the `Slideshow`, wires the buttons, Observer and arrow keys, removes `loading` once images and fonts are ready. Identical in every demo. |
| `js/demo22/stir.js`, `js/demo22/stirring.worker.js` | 22's fluid simulation, and the worker that runs it off the main thread. |
| `js/demo<N>/slideshow.js` | The `Slideshow` class with the transition for that variation, inside `navigate()`. In 17–22, also `createScene()`, which builds the shader. |
| `js/utils.js` | `preloadImages` (decodes the slide images), `prefersReducedMotion` and the `crossfade` used instead of the transition. |
| `js/webgl/Stage.js` | The WebGL canvas shared by 17–22: renderer, camera, one texture per slide, resize, showing and hiding the canvas, an `onRender` hook called before each frame, and `cover()` (TSL), which frames an image like the slides' `background-size: cover`. |
| `js/gsap.min.js`, `js/Observer.min.js` | Vendored GSAP and Observer 3.15.0. |
| `js/three/` | Vendored three.js 0.186.1: `three.webgpu.min.js`, `three.core.min.js`, `three.tsl.min.js`. |
| `css/base.css` | All styles, shared by every page: the frame, the variations nav, the slides, the `.deco` blocks, the image pieces some variations cut (`.slide__piece`), the WebGL canvas. |
| `og-image.jpg` | The 1200×630 social preview the `og:image`/`twitter:image` tags point to (a frame of the sand variation, now 21, mid-erosion, interface hidden). |
| `img/` | 55 Midjourney images in sets of five (`1`–`5`, `6`–`10`…), one set per page for 01–08 and 14–16. 09–13 reuse images from those sets; 17 uses `31`–`35`, 18 `26`–`30`, 19 `46`–`50`, 20 `21`–`25`, 21 `36`–`40`, 22 `1`–`5`, 23 `6`–`10`, 24 `51`–`55`, 25 `11`–`15`, 26 `16`–`20`, 27 `41`–`45`, 28 `46`–`50`, 29 `26`–`30`, 30 `31`–`35`, 31 `21`–`25`, 32 `36`–`40`. |

## How a page works

- `.slides` holds `.slide` elements, each with a `.slide__img` that has the picture as an inline `background-image`. Some variations add empty `.deco` blocks in `.slides` that cover the screen during the transition (demos 11, 12, 15, 16, 31). Some cut images up: their constructor adds `.slide__piece` copies of each slide's image to the slide (26, 27, 28, 30), each clipped to its part during a transition and hidden again after.
- `Slideshow` marks the visible slide with `slide--current` (the CSS gives `.slide--current` `opacity: 1`, the other slides `0`). `navigate(direction)` (1 = next, -1 = previous) works out the next index with wrap-around, then runs a GSAP timeline on `currentSlide`, `currentInner`, `upcomingSlide` and `upcomingInner`.
- `isAnimating` blocks any new navigation until the timeline's `onComplete` runs. **Every variation keeps this lock, including new ones**: no interruptible or overlapping transitions (tried on 17–19 and dropped). Whatever the timeline sets inline has to end in a state the CSS and the next transition can start from.
- With reduced motion, `navigate()` returns early after a 0.5s crossfade (`crossfade` in `js/utils.js`) and the variation's own timeline never runs. This block is the same in every `slideshow.js` (17–22 also take it while WebGL isn't ready).
- Input is the two buttons, the arrow keys (←/↑ previous, →/↓ next) and Observer (wheel, touch, pointer). One gesture moves one slide (`move()` in `index.js`, with `fresh`). After a flick, a trackpad keeps sending weaker and weaker wheel events for a second or two (its momentum); a separate `wheel` listener (capture phase, so it runs before Observer's update) ignores those, and starts a new gesture after a 200 ms pause or when an event comes in clearly stronger than the fading ones before it (more than 1.5× the last plus 4, once they've fallen below 60% of the gesture's peak). Every touch or drag starts a new gesture (`onPress`). A gesture that comes during a transition isn't used up: it moves a slide once the transition is over, if it's still going. An earlier version reset only on Observer's `onStop` (a quarter second with no events), so a new flick during the last one's momentum, or during a transition, did nothing.
- The frame is the CodropsTemplate's: `header.frame` with `h1.frame__title`, `nav.frame__links` (Article, All demos, GitHub), `nav.frame__tags`, `nav.frame__demos`, plus this demo's `nav.slides-nav`. `Demos/create_web_demo.py` (AI Workflows repo) reads the Article link and the tags out of this markup, and the tag text without `#` has to match a WordPress post tag's name. The ad script appends its `#cdawrap` box to `.frame`; `css/base.css` puts it in the `sponsor` grid area (above the tags).
- Every page `<head>` has the template's social preview tags (absolute URLs to `https://tympanus.net/Development/SlideshowAnimations/`) and favicons, and the analytics and ad scripts commented out, as in the template. They're uncommented only in the copy uploaded to the server (`Demos/DEMOS_UPDATE.md`), never here.
- SEO, per page: its own `<title>` ("<Name> Slideshow Transition | Codrops", "<Name> WebGL Slideshow Transition | Codrops" for 17–22; the main page is "Fullscreen Image Slideshow Animations | Codrops"), its own meta description (the variation's sentence plus "Made with GSAP." or "Made with three.js and GSAP." and "Part of Codrops' Slideshow Animations."), a canonical link with its live URL (the folder URL for `index.html`) repeated in `og:url`, the social title and description matching, `og:image:alt`/`twitter:image:alt`, a preconnect to Typekit, a preload of the page's first image (a CSS background, otherwise found late), and a JSON-LD `WebPage`. In the frame, `.frame__description` shows the same sentence under the title, and the current variation's nav link has `aria-current="page"`. The Article link stays the `?p=73708` permalink (the workflow's rule). The names of 01–16 (Parallax, Stretch, Inset, Rise, Fly-off, Wide, Flash, Card, Spin, Diagonal, Sweep, Blocks, Flip, Collapse, Shutters, Panels) were given for this.
- The `loading` class on `<body>` covers the page with a loader until the images are decoded and `document.fonts.ready` resolves.

### The WebGL variations (17–22)

- The DOM slides stay the real slideshow. `Stage` lays a canvas over them (`.slides__canvas`, hidden) that only draws while a transition runs, and hands back to the slides when it ends.
- `navigate()` works like every other variation's: `isAnimating` locks it, it points the shader at the two images, renders the first frame (identical to the current slide), shows the canvas, tweens `uniforms.progress` with GSAP rendering on every update, and when the last frame (identical to the upcoming slide) is drawn it swaps `slide--current` underneath and hides the canvas. All of them play their transition in reverse for going back (progress 1 to 0, with the two images swapped), so going back looks like rewinding.
- So **progress 0 and 1 must be exactly the two images**: every effect term fades to nothing at both ends (the shaders multiply them by an envelope like `sin(progress * PI)`), and noise-driven edges run from just outside the noise's range at 0 to just outside it at 1. The output is opaque (`vec4(…, 1)`), or the canvas would let the slides show through.
- One world unit is one CSS pixel on the z = 0 plane (`Stage.resize()` places the perspective camera for that), so a `PlaneGeometry(1, 1)` scaled to the viewport covers the slides. The canvas is capped at a device pixel ratio of 2.
- `Stage.init()` throws, and the variation keeps crossfading, when there's no WebGPU or WebGL 2, or when the browser is rendering in software (SwiftShader, llvmpipe, a fallback WebGPU adapter): these shaders are too heavy for the CPU. If the GPU drops the canvas later, `Stage.onLost` sets `isReady` back to false.
- Colours written as hex (the demo's palette) go through `THREE.Color`, which converts them to the linear values the shader works in; raw `0x1c / 255` values come out too light.
- Shaders are TSL (three.js's node language), which three.js compiles to WGSL for WebGPU or GLSL for WebGL 2. `Stage.compile()` compiles them before the first transition. The renderer is antialiased (17's sheet has real geometric edges).
- **Performance budget:** a frame at 2880×1800 (1440×900 at 2×) should stay within about 5 ms on WebGPU. Now: 17 1.4 ms, 18 1.7 ms, 19 1.1 ms, 20 2.1 ms, 21 2.3 ms, 22 1.8 ms plus 0.2 ms on the CPU (about 6 ms each on WebGL 2, mostly antialiasing). Procedural 3D noise per pixel is what blows it: an earlier pigment variation with ~15 noise lookups per pixel cost 56 ms and was replaced. Use sines, `hash()`, mipmap levels for blur and a few texture fetches, or do the work per vertex. In a loop over many items per pixel, count the square roots and divisions: in an earlier version of 22 (drops on water, 24 per pixel), one `inverseSqrt()` instead of `length()`, a division and a `pow()` took it from 18 ms to under 4.

## Variations

| #  | Page           | What it does |
| -- | -------------- | ------------ |
| 01 | `index.html`   | Slides push vertically, with the image shifting 30% in parallax. |
| 02 | `index2.html`  | Vertical push; the images are stretched 2.5× in height and tilted 10° as they go. |
| 03 | `index3.html`  | The current slide shrinks to 40% while its image zooms in; then the new slide slides in over it, its image settling from 1.5×. |
| 04 | `index4.html`  | The current slide shrinks, drifts and fades while the new one rises in with its image in parallax. |
| 05 | `index5.html`  | The current slide shrinks, tilts 20° and flies off as it fades; the new one comes in from below, scaling up. |
| 06 | `index6.html`  | Horizontal push with both images stretched 4× in width. |
| 07 | `index7.html`  | The new slide grows from scale 0 on top of the current one, with a brightness flash (600%) on its image. |
| 08 | `index8.html`  | The new slide flies in from the side as a small card stretched 4× wide, then grows to full size while the current image gains contrast and saturation and fades. |
| 09 | `index9.html`  | The current slide spins (500°) down to nothing; the new one turns in from -90° and 1.4×, fading in. Same in both directions. |
| 10 | `index10.html` | The new slide comes in diagonally over the current one, which drifts the other way and fades. |
| 11 | `index11.html` | A single `.deco` block sweeps vertically between the slides. |
| 12 | `index12.html` | Three `.deco` blocks (`--1`–`--3`) sweep horizontally between the slides, one after the other. |
| 13 | `index13.html` | The current slide slides up and out while the new one flips in (`rotationX` 140° to 0, from scale 0.1 and far back). |
| 14 | `index14.html` | The current slide collapses horizontally (`scaleX` to 0) while the new one opens from the other side. |
| 15 | `index15.html` | Two `.deco` blocks (`--4`) close in from the top and bottom, then part to reveal the new slide. |
| 16 | `index16.html` | Six `.deco` blocks (`--5`–`--7`, in pairs) close in from the left and right, one pair after another, then part to reveal the new slide. |
| 17 | `index17.html` | WebGL, "Unveil". The image is a sheet (a 192×120 mesh) that lifts from the top right corner and rolls back over itself around a cylinder along a wavy fold, lit from its real normals, pale on the back with the print showing faintly through, shading the sheet ahead of its tip and the image beneath along the fold, and is drawn off past the far corner while the next image settles underneath. Going back plays it in reverse: the sheet unrolls back over. |
| 18 | `index18.html` | WebGL, "Darkroom". The current photograph bleaches out to blank paper, brightest tones first and deepest shadows last, then the next develops on it like a print in the tray, darkest tones first and highlights last (each pixel's own luminance sets when it goes or comes). An uneven developer wash makes some areas run ahead as the tray rocks, and a red safelight, paper grain and a soft vignette come in towards the middle and clear by the end. One full-screen shader. A diagonal sheen of liquid crossing the paper was tried and removed (it read as a light sweeping past). Earlier attempts here (Strata, Melt) were dropped as stock effects with harsh lines. |
| 19 | `index19.html` | WebGL, "Duotone". The current image sinks into a two-tone print in the demo's own deco colours (`#1c1a1a` ink on `#d4503e`, converted to linear with `THREE.Color`), cut at each image's own average tone (its smallest mipmap level); the shapes flow into the next image's, cut from a blend of the two images' tones, and the next image's colour comes back. One full-screen shader. Next to Darkroom (18), which it's related to: moved here from 21, where it replaced "Ember" and "Steamed glass". |
| 20 | `index20.html` | WebGL, "Rearrange". The next image is rebuilt from the current one's pixels. The screen is a grid of 3+ px cells, each a GPU-instanced sprite; at each transition `pair()` reads both images' tones per cell (a small canvas copy), ranks them, splits the ranks into 12 bands of brightness and, within a band, pairs the two images' cells in their order along a Hilbert curve, so every pixel goes to a place of the same brightness, as near as it can (no tile seams). The pairing, leave times and targets go into a half-float data texture. Pixels leave band by band, highlights first, and fly on eased, slightly curved paths, round in flight and square in place, shifting from their colour to their target's; the two images are drawn only where a pixel hasn't left / has landed, over a dimmed mipmap blur of both. Replaced "Match cut" (a camera push-in and dissolve between the sculptures), and before it "Fracture", "Chiaroscuro", "Pin art", "Warp", "Fold" and "Smear". |
| 21 | `index21.html` | WebGL. The image erodes into grains of sand (one GPU-instanced sprite per 3+ px cell): the wind picks them up from the bottom left, in patches and one at a time, and carries them up and across, swirling and lifting, while the new image settles underneath. Going back is the same played in reverse: the sand blows back in and settles into the previous image. (Moved here from 19.) |
| 22 | `index22.html` | WebGL, "Stir". The image turns liquid and is stirred: three invisible strokes drag through it like a finger through paint, pulling the picture along in their wakes and curling it into eddies, and as the liquid slows, the next image settles out of the same flow into its own place, coming through first in the wakes. A real fluid simulation (stable fluids on a grid of about 10,000 cells: the velocity carried along by itself, made incompressible with 30 pressure iterations, walls at the screen's edges), in `stir.js`, run in a module worker (`stirring.worker.js`) between transitions so the page never waits, on the main thread if workers aren't available. It records 60 steps of where the current image's content on screen came from (stirred from the start) and where the next one's is going (settled by the end); `pour()` puts the moment between two steps in a half-float texture before each frame, and one full-screen shader reads both images through it. The liquid's motion is eased in and out, so the offsets are exactly 0 at both ends. Replaced "Marbling" (drops of clear water pushing the image aside, suminagashi) and a liquid morph by optimal transport (too little movement between these photos, read as a double exposure). |
| 23 | `index23.html` | "Slit". The upcoming slide opens out of a narrow band across the middle (a `clip-path` polygon), leaning against the direction: the band straightens and widens to about a fifth of the height, then opens all the way, while its image settles from 1.4× and a little off-centre. The current image is pushed back underneath, scaling to 1.15× and darkening to 35% brightness. No WebGL. |
| 24 | `index24.html` | "Pan". A camera move over the slides laid out side by side, the upcoming one next to the current on the side it comes from (6% apart): the view pulls back to 0.6×, pans across while the images shift a little inside their frames, and pushes in on the upcoming slide. One `camera` object (zoom, pan) is tweened and `place()` sets both slides from it on every update. No WebGL. |
| 25 | `index25.html` | "Dive". Going next, the upcoming image opens as a small picture (0.2×) in the middle of the current one and the view dives into it: both grow by the same factor (the current one to 5×), so the picture stays put in it until it fills the screen. Going back, the view pulls out of the current image, which shrinks into a small picture in the middle of the previous one and closes. |
| 26 | `index26.html` | "Columns". The upcoming image rises in five columns (`.slide__piece` copies clipped to each), from below going next and from above going back, the middle ones first, while the current image is pushed back to 1.1× and darkens. |
| 27 | `index27.html` | "Split". The current image is cut along a slanting line (two `.slide__piece` halves) and the halves shear apart along it, one up and one down (the other way round going back), uncovering the upcoming image as it settles from 1.25× and brightens. |
| 28 | `index28.html` | "Quadrants". Going next, the upcoming image arrives as four quarters (`.slide__piece` copies, each clipped a little past the middle so no hairline shows where they meet) that fly in together from the four corners and lock, while the current image is pushed back to 1.1× and darkens. Going back, the current image breaks into quarters that fly out to the corners, uncovering the previous one. Replaced "Focus" (a blur focus pull). |
| 29 | `index29.html` | "Hinge". The current slide tips over one of its bottom corners (the left going next, the right going back) and falls away, darkening, while the upcoming image comes up underneath, settling from 1.15× and brightening. |
| 30 | `index30.html` | "Doors". The current image splits down the middle into two doors (`.slide__piece` halves, with `transformPerspective`) that swing open together, away from us, darkening as they turn, while the upcoming image settles behind them from 1.25×. (Both doors start at the same time: no stagger.) |
| 31 | `index31.html` | "Chevron". A vermilion chevron (a `.deco--1` clipped with a `clip-path` polygon) sweeps across, pointing the way the slides travel (from the right going next, from the left going back), and the upcoming image follows close behind it in the same shape, while the current image darkens. No scaling or drifting of the images (an incoming image growing from 0.7× was tried: the deco showed around it). Replaced "Strobe" (faint copies running ahead of the image). |
| 32 | `index32.html` | "Cube". The two slides turn as two faces of a cube around its middle (`transformOrigin` half the screen's width behind them, perspective 2400 px), to the left going next and to the right going back, the view pulling back to 0.8× mid-turn, and each face darkening as it turns away. Replaced "Sweep" (a soft-edged mask wipe). |

## Adding a variation

1. Copy `js/demo<N>/` to a new `js/demo<M>/` and change the animation in `navigate()` only (keep the reduced-motion block at the top). For a WebGL one, start from 18, 19 or 22 (one full-screen shader), 17 (a mesh bent in the vertex shader) or 20 and 21 (several meshes and instanced sprites).
2. Copy a page to `index<M>.html` (it brings the frame, social tags and commented scripts) and change the `demo-<M>` body class, the images (`img/…`), any `.deco` elements, and the script path. A WebGL page needs the import map from `index17.html`. Then its SEO (see "How a page works"): name the variation and write its sentence, and set the `<title>`, the meta description, the canonical link and `og:url` (`…/index<M>.html`), the social title and description, the preload (its first image), the JSON-LD, and the `.frame__description` line. Titles and descriptions are Manoela's to approve.
3. Add the link to the `.frame__demos` nav on **every** page. The current page's link gets `frame__demo--current` and `aria-current="page"`. The main page's description counts the variations: update it. The nav is a grid of eight per row and wraps by itself.
4. Add any new `.deco--<n>` colour to `css/base.css`. Reuse the existing images and fonts.

## Conventions

- Anything a timeline sets inline must either end at a value the CSS expects or be cleaned up in `onComplete`. Items that use `autoAlpha` leave `visibility` set inline.
- `.frame` and `.slides` use `100vh` with a `100svh` line after it. Keep both.
- The decorative images have no alt text, because they are CSS backgrounds and purely visual.

### TSL pitfalls (17–22)

- Texture nodes made from the same texture share one binding. Start each slot (`mapA`, `mapB`) on a different texture (`createScene()` uses slides 0 and 1), then swap them with `.value`; nodes made from a base with `texture(base, uv)` follow its `.value`.
- No reversed `smoothstep` edges (`smoothstep(1, 0, x)`): GLSL leaves them undefined, so the WebGL 2 fallback could differ. Write `smoothstep(0, 1, x).oneMinus()`.
- No `pow()` of something that can be negative (undefined in both WGSL and GLSL): square with `x.mul(x)`.
- Sampling a texture in the vertex stage (the grains' colour in 21) needs an explicit `.level()`; pass the result to the fragment stage with `varying()`.
- Render-target textures (if one is ever used) come back with y down when sampled with a plane's `uv()`: three.js's own flip for them assumes `screenUV`.
- Anything computed per vertex and passed to the fragment stage interpolates linearly per triangle: pass linear values (positions) and compute non-linear ones (shadows, `exp`, `select`) per pixel, or they show the mesh's steps.
- Integer-valued floats (cell indices) go through `hash()` identically in both stages, which is what lets the plane in 21 and its grains agree on when each cell leaves. Keep that function shared.
- A bool node has no `.not()` (it throws while the shader is built, and the variation falls back to crossfading): write the comparison the other way round.
- A one-byte-per-texel `DataTexture` (`RedFormat`, `UnsignedByteType`) whose width isn't a multiple of four needs `unpackAlignment = 1`, or WebGL 2 reads its rows skewed.
- Screen-space derivatives (`fwidth()`, `dFdx()`, a texture's automatic mipmap level) are taken over 2×2 pixel blocks: inside a loop, or after one that `Break()`s early, they come out blocky or wrong (a dotted line along the drop edges of an earlier version of 22). Work out the stretch yourself and sample with `.grad()` instead.

## Style

- Two-space indentation in the demo files (four in `js/utils.js`), single quotes, semicolons. Follow what's in the file (`js/demo6/slideshow.js` was never run through Prettier; leave it).
- JSDoc blocks on the class and its methods, short `//` comments above each step of `navigate()`. GSAP timelines are written as a chain with `.addLabel('start', 0)` and `.to`/`.fromTo` calls placed on labels.
- In the WebGL variations, the class's JSDoc says what the transition looks like in plain words, including going back, and the shader comments say what each step looks like rather than restating the maths.
- No dependencies and no build tooling unless asked.

## Ask before changing

- The pages' `<title>`, meta description and keywords, the social preview tags and `og-image.jpg`, the `frame__title` heading, the frame links (Article, All demos, GitHub) and tags, and the credits.
- The author's original variations 01–16 (their animations).
