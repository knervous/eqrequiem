import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";

export function getAssetContainerMeshes(
  container: BJS.AssetContainer,
): BJS.Mesh[] {
  return container.meshes.filter(
    (mesh): mesh is BJS.Mesh =>
      mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0,
  );
}

export function getOrCreateAssetContainerRoot(
  container: BJS.AssetContainer,
  scene: BJS.Scene,
  name: string,
): BJS.TransformNode {
  container.populateRootNodes();
  const roots = container.rootNodes.filter(
    (node): node is BJS.TransformNode =>
      node instanceof BABYLON.TransformNode,
  );

  if (roots.length === 1) {
    roots[0].name = name;
    return roots[0];
  }

  const root = new BABYLON.TransformNode(name, scene);
  container.transformNodes.push(root);
  for (const node of roots) {
    node.setParent(root);
  }
  container.populateRootNodes();
  return root;
}
