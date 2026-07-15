// Shared by pdp.js and homeViewer.js — mesh naming is per-model, not per-construction-type,
// verified against each model's actual scene graph, not guessed. Two different acetate-bodied
// models (acetate.glb, cool-sunglasses.glb) use entirely different node names for the same
// *kind* of part, so the category map is keyed by model URL, not by a single "acetate" vs
// "metal" switch — every new model just needs its own entry here.
export const MODEL_NAME_MAPS = {
  // Aviator (all-metal): frame/handles/hinge are separate metal parts, no nosepad mesh
  // of its own (Cube001/Cube001_1 are the Nose_pad_001 group's two sub-parts).
  "/models/aviator-glass3.glb": {
    frame: "frame",
    handles: "handles",
    hinge: "hinge",
    lens: "lens",
    gap: "frame",
    bridge: "frame",
    Cube001: "frame",
    Cube001_1: "frame",
  },
  // Acetate: front + temples are one continuous pigmented body ("Frame"/"Temple"),
  // hinge hardware is five small metal parts, no nosepad meshes at all (integrated
  // into the acetate body itself).
  "/models/acetate.glb": {
    Frame: "acetate",
    Temple: "acetate",
    Lens: "lens",
    "Bolt.002": "hinge",
    Circle: "hinge",
    "Circle.001": "hinge",
    "Circle.002": "hinge",
    Cube: "hinge",
  },
  // Cool Sunglasses: a genuine hybrid — "Frame"/"Temple L"/"Temple L.001"/"nose pad
  // head" all share the non-metallic "Black FRame" glTF material (metalness 0,
  // moderate roughness) and are treated as the single acetate body; "Bolt"/"Screw"/
  // "Nose Pad" all share metallic "gold.*" materials and are lumped into the hinge
  // category, matching how acetate.glb's own multi-piece hinge hardware is handled —
  // one shared controllable metal finish, not a separate tab per hardware piece.
  "/models/cool-sunglasses.glb": {
    Frame: "acetate",
    "Temple L": "acetate",
    "Temple L.001": "acetate",
    "nose pad head": "acetate",
    Bolt: "hinge",
    Screw: "hinge",
    "Nose Pad": "hinge",
    Lens: "lens",
  },
};

export function classifyMesh(mesh, modelUrl) {
  const nameToCategory = MODEL_NAME_MAPS[modelUrl] ?? MODEL_NAME_MAPS["/models/aviator-glass3.glb"];
  if (mesh.name in nameToCategory) return nameToCategory[mesh.name];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.some((m) => m && m.name === "logo")) return "text";
  return "unknown";
}
