import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})$/;

// Helper to build the base NodeMaterial graph
function buildBaseAtlasTintPBR(scene: BJS.Scene, texture: BJS.Texture): BJS.NodeMaterial {
  const mat = new BABYLON.NodeMaterial("atlasTintPBR", scene);

  // 1) Vertex Inputs
  const position = new BABYLON.InputBlock("position", BABYLON.NodeMaterialBlockTargets.Vertex, BABYLON.NodeMaterialBlockConnectionPointTypes.Vector3);
  position.setAsAttribute("position");

  const normal = new BABYLON.InputBlock("normal", BABYLON.NodeMaterialBlockTargets.Vertex, BABYLON.NodeMaterialBlockConnectionPointTypes.Vector3);
  normal.setAsAttribute("normal");

  const uv = new BABYLON.InputBlock("uv", BABYLON.NodeMaterialBlockTargets.Vertex, BABYLON.NodeMaterialBlockConnectionPointTypes.Vector2);
  uv.setAsAttribute("uv");

  const world = new BABYLON.InputBlock("world", BABYLON.NodeMaterialBlockTargets.Vertex, BABYLON.NodeMaterialBlockConnectionPointTypes.Matrix);
  world.setAsSystemValue(BABYLON.NodeMaterialSystemValues.World);

  const viewProjection = new BABYLON.InputBlock("viewProjection", BABYLON.NodeMaterialBlockTargets.Vertex, BABYLON.NodeMaterialBlockConnectionPointTypes.Matrix);
  viewProjection.setAsSystemValue(BABYLON.NodeMaterialSystemValues.ViewProjection);

  const scale = new BABYLON.InputBlock("scale", BABYLON.NodeMaterialBlockTargets.Fragment, BABYLON.NodeMaterialBlockConnectionPointTypes.Vector2);
  scale.value = new BABYLON.Vector2(1, 1);

  const offset = new BABYLON.InputBlock("offset", BABYLON.NodeMaterialBlockTargets.Fragment, BABYLON.NodeMaterialBlockConnectionPointTypes.Vector2);
  offset.value = new BABYLON.Vector2(0, 0);

  // 2) Transform UVs
  const mul = new BABYLON.MultiplyBlock("uv*scale");
  const add = new BABYLON.AddBlock("mul+off");

  uv.output.connectTo(mul.left);
  scale.output.connectTo(mul.right);
  mul.output.connectTo(add.left);
  offset.output.connectTo(add.right);

  // 3) Sample atlas
  const sampler = new BABYLON.TextureBlock("albedoSampler");
  sampler.texture = texture;
  add.output.connectTo(sampler.uv);

  // 4) Tint
  const tint = new BABYLON.InputBlock("tint", BABYLON.NodeMaterialBlockTargets.Fragment, BABYLON.NodeMaterialBlockConnectionPointTypes.Color3);
  tint.value = new BABYLON.Color3(1, 1, 1);

  const tinted = new BABYLON.MultiplyBlock("albedo*tint");
  sampler.rgb.connectTo(tinted.left);
  tint.output.connectTo(tinted.right); // Fixed: Connect tint block

  // 5) PBR
  const pbr = new BABYLON.PBRMetallicRoughnessBlock("pbr");

  // Connect required PBR inputs
  tinted.output.connectTo(pbr.baseColor);

  // Provide default metallic and roughness values
  const metallic = new BABYLON.InputBlock("metallic", BABYLON.NodeMaterialBlockTargets.Fragment, BABYLON.NodeMaterialBlockConnectionPointTypes.Float);
  metallic.value = 0.0; // Default: non-metallic
  metallic.output.connectTo(pbr.metallic);

  const roughness = new BABYLON.InputBlock("roughness", BABYLON.NodeMaterialBlockTargets.Fragment, BABYLON.NodeMaterialBlockConnectionPointTypes.Float);
  roughness.value = 0.5; // Default: moderate roughness
  roughness.output.connectTo(pbr.roughness);

  // Transform position and normal to world space
  const worldPosition = new BABYLON.TransformBlock("worldPosition");
  position.output.connectTo(worldPosition.vector);
  world.output.connectTo(worldPosition.transform);
  worldPosition.output.connectTo(pbr.worldPosition);

  const worldNormal = new BABYLON.TransformBlock("worldNormal");
  normal.output.connectTo(worldNormal.vector);
  world.output.connectTo(worldNormal.transform);
  worldNormal.output.connectTo(pbr.worldNormal);

  // 6) Vertex Output
  const vertexOutput = new BABYLON.VertexOutputBlock("vertexOutput");
  const transform = new BABYLON.TransformBlock("transform");
  worldPosition.output.connectTo(transform.vector);
  viewProjection.output.connectTo(transform.transform);
  transform.output.connectTo(vertexOutput.vector);

  // 7) Fragment Output
  const fragmentOutput = new BABYLON.FragmentOutputBlock("fragmentOutput");
  pbr.baseColor.connectTo(fragmentOutput.rgb); // Use PBR output as final color

  // 8) Add outputs and build
  mat.addOutputNode(vertexOutput);
  mat.addOutputNode(fragmentOutput);
  mat.build(true);

  return mat;
}

// Apply NodeMaterials per submesh
export function applyNodeMaterialsPerSubmesh(
  mesh: BJS.Mesh,
  atlasJson: any, // Adjust type as needed
  texture: BJS.Texture,
) {
  const scene = mesh.getScene();

  const subMaterials = new Array<BJS.NodeMaterial>();
  mesh.subMeshes!.forEach((subMesh, i) => {
    const material = subMesh.getMaterial();
    if (!material) {
      console.warn(`[Player] Sub-mesh ${i} has no valid StandardMaterial`);
      return;
    }
    const match = material.name.match(charFileRegex);
    if (!match) {
      console.warn(`[Player] Sub-material name ${material.name} does not match expected format`);
      return;
    }

    const [,, piece, variation, texIdx] = match;
    const varNum = parseInt(variation, 10);
    const texNum = parseInt(texIdx, 10);

    // Find atlas entry with validation
    const entry = atlasJson[piece]?.variations?.[varNum]?.textures?.[texNum];
    if (!entry) {
      console.warn(`[Player] No atlas entry found for ${piece}, variation ${varNum}, texture ${texNum}`);
      return;
    }
    const mat = buildBaseAtlasTintPBR(scene, texture);
    mat.name = `${material.name}_nodeMat_${i}`;
    // Get blocks by corrected names
    const sampler = mat.getBlockByName("albedoSampler") as BJS.TextureBlock;
    const offsetBlock = mat.getBlockByName("offset") as BJS.InputBlock;
    const scaleBlock = mat.getBlockByName("scale") as BJS.InputBlock;
    const tintBlock = mat.getBlockByName("tint") as BJS.InputBlock;

    // Set the shared atlas texture
    sampler.texture = texture;

    // Calculate UV coordinates
    const w = texture.getSize().width!;
    const h = texture.getSize().height!;
    const uMin = entry.x / w;
    const vMin = entry.y / h;
    const uMax = (entry.x + entry.width) / w;
    const vMax = (entry.y + entry.height) / h;

    // Set block values
    offsetBlock.value = new BABYLON.Vector2(uMin, vMin);
    scaleBlock.value = new BABYLON.Vector2(uMax - uMin, vMax - vMin);

    // Optional: Set tint
    tintBlock.value = new BABYLON.Color3(1, 0.75, 0.5); // Example tint

    subMaterials.push(mat);
  });

  // Create and assign MultiMaterial
  const multi = new BABYLON.MultiMaterial("playerMulti", scene);
  multi.subMaterials = subMaterials;
  mesh.material = multi;
}