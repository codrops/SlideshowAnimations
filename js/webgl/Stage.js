import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, min } from 'three/tsl';

/**
 * Stage Class
 * A canvas laid over the slides that draws them only while a transition runs.
 * WebGPU where the browser has it, WebGL 2 otherwise (three.js picks the backend).
 * One world unit is one CSS pixel on the z = 0 plane, so a plane of the
 * viewport's size there covers the slides exactly.
 * @export
 */
export class Stage {
  /**
   * Holds references to relevant DOM elements.
   * @type {Object}
   */
  DOM = {
    el: null, // The slides container the canvas goes into
    canvas: null, // The renderer's canvas
  };
  /**
   * Viewport size in CSS pixels, shared with the shaders.
   * @type {UniformNode<vec2>}
   */
  viewport = uniform(new THREE.Vector2(1, 1));
  /**
   * One texture per slide, in slide order.
   * @type {THREE.Texture[]}
   */
  textures = [];
  /**
   * Called after every resize, so a variation can size its meshes.
   * @type {Function}
   */
  onResize = () => {};
  /**
   * Called if the GPU drops the canvas, so a variation can stop using it.
   * @type {Function}
   */
  onLost = () => {};
  /**
   * Called just before each frame is drawn, so a variation can update what it draws.
   * @type {Function}
   */
  onRender = () => {};
  /**
   * Flag to indicate the GPU dropped the canvas (a driver reset, for one).
   * @type {boolean}
   */
  isLost = false;

  /**
   * Stage constructor.
   * @param {HTMLElement} DOM_el - The slides container.
   */
  constructor(DOM_el) {
    this.DOM.el = DOM_el;

    this.renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    // If the GPU drops the canvas, stop drawing and leave the slides to crossfade
    this.renderer.onDeviceLost = (info) => {
      this.isLost = true;
      this.hide();
      console.warn(`The ${info.api} device was lost, slides will crossfade.`, info.message);
      this.onLost();
    };
    this.DOM.canvas = this.renderer.domElement;
    this.DOM.canvas.classList.add('slides__canvas');
    this.DOM.el.append(this.DOM.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);
  }

  /**
   * Start the renderer and upload the slide images.
   * @param {HTMLElement[]} slidesInner - The elements holding each slide's background image.
   * @returns {Promise} Resolves when the stage can draw.
   */
  async init(slidesInner) {
    await this.renderer.init();
    // A software renderer can't keep up with these shaders, so leave the slides to crossfade there too
    if (this.isSoftware()) throw new Error('Software rendering only');

    const loader = new THREE.TextureLoader();
    this.textures = await Promise.all(
      slidesInner.map((el) => {
        const src = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
        return loader.loadAsync(src).then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          return texture;
        });
      })
    );

    this.resize();
    // Resize once per frame at most
    let frame = null;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.resize());
    });
  }

  /**
   * Whether the browser is rendering on the CPU (no GPU, or a blocklisted one).
   * @returns {boolean}
   */
  isSoftware() {
    const { backend } = this.renderer;
    if (backend.isWebGPUBackend) return backend.device.adapterInfo?.isFallbackAdapter === true;
    const { gl } = backend;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return /swiftshader|llvmpipe|software/i.test(name);
  }

  /**
   * Match the canvas and camera to the viewport.
   */
  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);

    // Put the camera where the z = 0 plane is exactly the viewport
    this.camera.aspect = width / height;
    this.camera.position.z =
      height / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.near = this.camera.position.z / 10;
    this.camera.far = this.camera.position.z * 10;
    this.camera.updateProjectionMatrix();

    this.viewport.value.set(width, height);
    this.onResize(width, height);
  }

  /**
   * Compile the scene's shaders ahead of the first transition, so it doesn't stutter.
   * @returns {Promise}
   */
  compile() {
    return this.renderer.compileAsync(this.scene, this.camera);
  }

  /**
   * Draw a frame.
   */
  render() {
    if (this.isLost) return;
    this.onRender();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Show the canvas over the slides.
   */
  show() {
    this.DOM.canvas.classList.add('slides__canvas--visible');
  }

  /**
   * Hide the canvas and let the slides show through again.
   */
  hide() {
    this.DOM.canvas.classList.remove('slides__canvas--visible');
  }
}

/**
 * Texture coordinates that frame an image like `background-size: cover`
 * with `background-position: 50% 50%`, as the slides do.
 * @param {Node<vec2>} uv - Coordinates across the viewport, 0 to 1.
 * @param {Node<vec2>} viewport - Viewport size.
 * @param {Node<vec2>} image - Image size.
 * @returns {Node<vec2>}
 */
export const cover = Fn(([uv, viewport, image]) => {
  const ratio = vec2(
    min(viewport.x.div(viewport.y).div(image.x.div(image.y)), 1),
    min(viewport.y.div(viewport.x).div(image.y.div(image.x)), 1)
  );
  return uv.sub(0.5).mul(ratio).add(0.5);
});
