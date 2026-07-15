import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/**
 * Loads the studio HDRI from /public and PMREM-generates it into a texture
 * suitable for scene.environment (drives IBL reflections on the frame metal).
 */
export function loadStudioEnvironment(renderer, url = "/studio_small_09_2k.hdr") {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  return new Promise((resolve, reject) => {
    new HDRLoader().load(
      url,
      (hdrTexture) => {
        const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
        hdrTexture.dispose();
        pmremGenerator.dispose();
        resolve(envMap);
      },
      undefined,
      (error) => {
        pmremGenerator.dispose();
        reject(error);
      },
    );
  });
}

/**
 * Bright, warm studio sweep — pale warm-gray fading to off-white, with a soft radial
 * falloff (not a flat plane) so the product reads with some depth behind it, and a
 * gentle vignette so it never blows out to pure white at the edges.
 */
export function createStudioBackground({
  topColor = "#e8e4dd",
  bottomColor = "#f7f5f1",
  size = 1024,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Soft radial glow behind where the product sits, instead of a flat color plane.
  const glow = ctx.createRadialGradient(
    size / 2, size * 0.5, size * 0.1,
    size / 2, size * 0.5, size * 0.55,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.35)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // A faint horizon suggestion — where a seamless studio sweep would curve from wall
  // to tabletop — so the product has a spatial anchor instead of floating in a void.
  const horizon = ctx.createLinearGradient(0, size * 0.6, 0, size * 0.72);
  horizon.addColorStop(0, "rgba(0,0,0,0)");
  horizon.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, size * 0.6, size, size * 0.4);

  const vignette = ctx.createRadialGradient(
    size / 2, size * 0.55, size * 0.2,
    size / 2, size * 0.55, size * 0.85,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Large, shadow-only ground plane. THREE.ShadowMaterial only renders where an actual
 * shadow falls (everywhere else is fully transparent), so there's no visible plane
 * edge regardless of size — the softness comes from the casting light's shadow.radius/
 * blurSamples (VSM shadow map, tuned in main.js) plus a low opacity here so the contact
 * shadow reads as a soft, blurred hint rather than a hard dark blob.
 */
export function createShadowCatcherGround(size = 4) {
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.ShadowMaterial({ opacity: 0.18 });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}
