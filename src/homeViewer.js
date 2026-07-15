import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadModel } from "./loader.js";
import { loadStudioEnvironment, createShadowCatcherGround } from "./environment.js";
import { createFrameMaterial } from "./frameMaterial.js";
import { createLensMaterial } from "./lensMaterial.js";
import { createAcetateMaterial } from "./acetateMaterial.js";
import { createTextMaterial } from "./textMaterial.js";
import { classifyMesh } from "./meshCategoryMap.js";

const DEFAULT_MODEL_URL = "/models/aviator-glass3.glb";

// The studio HDRI is identical for every viewer instance on the page — load it once
// and share the resulting PMREM env map rather than decoding the same file per canvas.
let sharedEnvMapPromise = null;
function ensureEnvironment(renderer) {
  if (!sharedEnvMapPromise) {
    sharedEnvMapPromise = loadStudioEnvironment(renderer).catch((error) => {
      console.error("[homeViewer] Failed to load studio HDRI:", error);
      sharedEnvMapPromise = null;
      return null;
    });
  }
  return sharedEnvMapPromise;
}

/**
 * A stripped-down version of the PDP's render pipeline — same materials/environment/
 * lighting, no rail UI, no click-to-rotate detail stage. Meant for small, ambient
 * "the product is real" moments (a plate photo, an editorial close-up, a live
 * configurator preview), not full product-page interaction.
 */
export function mountProductViewer(canvas, product, { autoRotate = true, rotateSpeed = 1.6 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.environmentIntensity = 1.2;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = rotateSpeed;
  controls.target.set(0, 0, 0);

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.0);
  keyLight.position.set(0.35, 0.45, 0.3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.radius = 10;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight, keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xf5f0ff, 0.32);
  fillLight.position.set(-0.4, 0.25, -0.2);
  scene.add(fillLight);

  const shadowGround = createShadowCatcherGround();
  scene.add(shadowGround);

  ensureEnvironment(renderer).then((envMap) => {
    if (!envMap) return;
    scene.environment = envMap;
    frameMaterial?.setEnvironment(envMap);
    hingeMaterial?.setEnvironment(envMap);
    handlesMaterial?.setEnvironment(envMap);
    acetateMaterial?.setEnvironment(envMap);
  });

  let currentProduct = product;
  let modelUrl = product.model ?? DEFAULT_MODEL_URL;
  let isAcetate = product.frameConstruction === "acetate";

  let frameMaterial = isAcetate ? null : createFrameMaterial(product.frameFinish);
  let acetateMaterial = isAcetate ? createAcetateMaterial(product.acetateColor) : null;
  let lensMaterial = createLensMaterial(product.lensTint);
  let hingeMaterial = createFrameMaterial(isAcetate ? (product.hingeFinish ?? "gunmetal") : product.frameFinish);
  let handlesMaterial = isAcetate ? null : createFrameMaterial(product.frameFinish);
  let textMaterial = createTextMaterial(product.textColor ?? "silver");

  const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.1 });

  let currentModel = null;
  let loadToken = 0;

  function frameCamera(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const distance = maxDim * 2.7;
    camera.position.set(distance * 0.5, distance * 0.32, distance * 0.8);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.minDistance = maxDim * 1.5;
    controls.maxDistance = maxDim * 6;
    controls.update();

    shadowGround.position.y = box.min.y - center.y - maxDim * 0.02;
  }

  function applyMaterials(model, url) {
    model.traverse((object) => {
      if (!object.isMesh) return;
      const category = classifyMesh(object, url);
      if (category === "lens") object.material = lensMaterial;
      else if (category === "hinge") object.material = hingeMaterial;
      else if (category === "acetate") object.material = acetateMaterial;
      else if (category === "handles") object.material = handlesMaterial;
      else if (category === "text") object.material = textMaterial;
      else if (category === "frame") object.material = frameMaterial;
      else object.material = placeholderMaterial;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  async function load(nextProduct) {
    const token = ++loadToken;
    currentProduct = nextProduct;
    modelUrl = nextProduct.model ?? DEFAULT_MODEL_URL;
    isAcetate = nextProduct.frameConstruction === "acetate";

    frameMaterial = isAcetate ? null : createFrameMaterial(nextProduct.frameFinish);
    acetateMaterial = isAcetate ? createAcetateMaterial(nextProduct.acetateColor) : null;
    lensMaterial = createLensMaterial(nextProduct.lensTint);
    hingeMaterial = createFrameMaterial(isAcetate ? (nextProduct.hingeFinish ?? "gunmetal") : nextProduct.frameFinish);
    handlesMaterial = isAcetate ? null : createFrameMaterial(nextProduct.frameFinish);
    textMaterial = createTextMaterial(nextProduct.textColor ?? "silver");

    const envMap = await sharedEnvMapPromise;
    if (token !== loadToken) return;
    if (envMap) {
      frameMaterial?.setEnvironment(envMap);
      hingeMaterial?.setEnvironment(envMap);
      handlesMaterial?.setEnvironment(envMap);
      acetateMaterial?.setEnvironment(envMap);
    }

    const gltf = await loadModel(modelUrl);
    if (token !== loadToken) return;
    const model = gltf.scene;
    applyMaterials(model, modelUrl);
    frameCamera(model);

    if (currentModel) scene.remove(currentModel);
    currentModel = model;
    scene.add(model);
  }

  function resize() {
    const w = canvas.parentElement?.clientWidth || canvas.clientWidth;
    const h = canvas.parentElement?.clientHeight || canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  const ro = new ResizeObserver(resize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);

  let raf = null;
  let running = false;

  function tick() {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }

  function setActive(active) {
    if (active === running) return;
    running = active;
    if (active) {
      if (!raf) tick();
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  load(product);
  setActive(true);

  return {
    camera,
    controls,
    setActive,
    setAutoRotate(active) {
      controls.autoRotate = active;
    },
    setProduct: load,
    setFrameFinish(finish) {
      if (!isAcetate) frameMaterial?.setFrameFinish(finish);
    },
    setHingeFinish(finish) {
      hingeMaterial?.setHingeFinish(finish);
    },
    setAcetateColor(color) {
      if (isAcetate) acetateMaterial?.setAcetateColor?.(color);
    },
    setLensTint(tint) {
      lensMaterial?.setLensTint(tint);
    },
    get product() {
      return currentProduct;
    },
    dispose() {
      setActive(false);
      ro.disconnect();
      renderer.dispose();
    },
  };
}
