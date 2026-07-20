export function createShadoShowcaseEnvironment(B: any, scene: any): {
  ground: any;
  skybox: any;
} {
  let seed = 0x51ad0;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  const groundTexture = new B.DynamicTexture('shado-ground-texture', { width: 512, height: 512 }, scene, false);
  const groundContext = groundTexture.getContext();
  groundContext.fillStyle = '#293426';
  groundContext.fillRect(0, 0, 512, 512);
  // Layer soft moss, packed earth, and stone at several scales. This remains
  // procedural/offline-safe for the Babylon Playground but reads as terrain
  // rather than the previous validation grid.
  for (let i = 0; i < 760; i++) {
    const x = random() * 512;
    const y = random() * 512;
    const radius = 3 + random() * 19;
    const moss = random() > 0.42;
    groundContext.fillStyle = moss
      ? `rgba(${38 + random() * 22},${54 + random() * 27},${30 + random() * 15},${0.05 + random() * 0.11})`
      : `rgba(${64 + random() * 22},${53 + random() * 16},${38 + random() * 13},${0.04 + random() * 0.09})`;
    groundContext.beginPath();
    groundContext.arc(x, y, radius, 0, Math.PI * 2);
    groundContext.fill();
  }
  // Fine leaf litter and stone flecks break up repetition without the broad
  // crossing paths that previously turned into obvious tiled stripes.
  for (let i = 0; i < 3600; i++) {
    const light = 42 + Math.floor(random() * 30);
    groundContext.fillStyle = `rgba(${light},${light + 8},${Math.max(25, light - 10)},${0.05 + random() * 0.12})`;
    const size = 0.45 + random() * 1.8;
    groundContext.fillRect(random() * 512, random() * 512, size, size);
  }
  groundTexture.update(false);
  groundTexture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  groundTexture.wrapV = B.Texture.WRAP_ADDRESSMODE;
  groundTexture.uScale = 112;
  groundTexture.vScale = 112;

  // Cover the full 600m culling preset with breathing room in every direction.
  const ground = B.MeshBuilder.CreateGround('shado-showcase-plane', { width: 2400, height: 2400 }, scene);
  ground.position.y = -1;
  const groundMaterial = new B.StandardMaterial('shado-ground-material', scene);
  groundMaterial.diffuseTexture = groundTexture;
  groundMaterial.diffuseColor = new B.Color3(0.66, 0.72, 0.61);
  groundMaterial.specularColor = B.Color3.Black();
  ground.material = groundMaterial;

  const skyTexture = new B.DynamicTexture('shado-sky-texture', { width: 1024, height: 512 }, scene, false);
  const skyContext = skyTexture.getContext();
  const gradient = skyContext.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#07101f');
  gradient.addColorStop(0.5, '#172a43');
  gradient.addColorStop(0.78, '#4f6477');
  gradient.addColorStop(1, '#b28a62');
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    const alpha = 0.25 + random() * 0.7;
    skyContext.fillStyle = `rgba(230,238,255,${alpha})`;
    const radius = random() < 0.92 ? 1 : 2;
    skyContext.fillRect(random() * 1024, random() * 300, radius, radius);
  }
  skyContext.fillStyle = 'rgba(210,224,235,.055)';
  for (let i = 0; i < 26; i++) {
    skyContext.beginPath();
    skyContext.ellipse(random() * 1024, 240 + random() * 100, 45 + random() * 90, 7 + random() * 18, 0, 0, Math.PI * 2);
    skyContext.fill();
  }
  skyTexture.update(false);
  skyTexture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  skyTexture.wrapV = B.Texture.CLAMP_ADDRESSMODE;

  const skybox = B.MeshBuilder.CreateSphere('shado-wide-skybox', {
    diameter: 1100,
    segments: 32,
    sideOrientation: B.Mesh.BACKSIDE,
  }, scene);
  skybox.scaling.y = 0.58;
  skybox.position.y = 32;
  skybox.infiniteDistance = true;
  const skyMaterial = new B.StandardMaterial('shado-sky-material', scene);
  skyMaterial.disableLighting = true;
  skyMaterial.emissiveTexture = skyTexture;
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableDepthWrite = true;
  skybox.material = skyMaterial;
  skybox.renderingGroupId = 0;
  // Keep the plane with actors in the same rendering group. Babylon clears
  // depth between groups by default; placing ground later would paint over the
  // entire roster even though all Shado draws completed successfully.
  ground.renderingGroupId = 0;
  return { ground, skybox };
}
