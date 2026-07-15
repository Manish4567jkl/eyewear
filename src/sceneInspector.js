export function logSceneStructure(root, label = "Scene") {
  const rows = [];

  root.traverse((object) => {
    if (!object.isMesh) return;

    const geometry = object.geometry;
    const vertexCount = geometry?.attributes?.position?.count ?? 0;
    const material = object.material;
    const materials = Array.isArray(material) ? material : [material];

    rows.push({
      name: object.name || "(unnamed)",
      type: object.type,
      vertexCount,
      materialName: materials.map((m) => m?.name || "(unnamed)").join(", "),
      materialType: materials.map((m) => m?.type).join(", "),
    });
  });

  console.log(`%c[${label}] ${rows.length} mesh(es) found`, "font-weight: bold; color: #4ade80;");
  console.table(rows);

  return rows;
}
