import { AABB, MeshInstance3D, Node3D, Vector3 } from "godot";

export const getMeshAABB = (node: Node3D): AABB | null => {
  let combinedAABB: AABB | null = null;

  const traverseForMeshes = (currentNode: Node3D) => {
    if (currentNode instanceof MeshInstance3D) {
      const mesh = currentNode.mesh;
      if (mesh) {
        // Get the local AABB of the mesh
        const localAABB = mesh.get_aabb();
        // Get the global transform of the MeshInstance3D
        const transform = currentNode.global_transform;
  
        // Define the 8 corners of the AABB in local space
        const corners = [
          localAABB.position,
          localAABB.position.add(new Vector3(localAABB.size.x, 0, 0)),
          localAABB.position.add(new Vector3(0, localAABB.size.y, 0)),
          localAABB.position.add(new Vector3(0, 0, localAABB.size.z)),
          localAABB.position.add(new Vector3(localAABB.size.x, localAABB.size.y, 0)),
          localAABB.position.add(new Vector3(localAABB.size.x, 0, localAABB.size.z)),
          localAABB.position.add(new Vector3(0, localAABB.size.y, localAABB.size.z)),
          localAABB.position.add(localAABB.size),
        ];
  
        // Transform corners to global space inline
        // Initialize min/max with the first corner
        const firstCorner = corners[0];
        // Apply transform: globalPoint = basis * corner + origin
        const basis = transform.basis;
        let minX = basis.x.x * firstCorner.x + basis.y.x * firstCorner.y + basis.z.x * firstCorner.z + transform.origin.x;
        let minY = basis.x.y * firstCorner.x + basis.y.y * firstCorner.y + basis.z.y * firstCorner.z + transform.origin.y;
        let minZ = basis.x.z * firstCorner.x + basis.y.z * firstCorner.y + basis.z.z * firstCorner.z + transform.origin.z;
        let maxX = minX;
        let maxY = minY;
        let maxZ = minZ;
  
        // Transform remaining corners and update min/max
        for (let i = 1; i < corners.length; i++) {
          const corner = corners[i];
          const globalX = basis.x.x * corner.x + basis.y.x * corner.y + basis.z.x * corner.z + transform.origin.x;
          const globalY = basis.x.y * corner.x + basis.y.y * corner.y + basis.z.y * corner.z + transform.origin.y;
          const globalZ = basis.x.z * corner.x + basis.y.z * corner.y + basis.z.z * corner.z + transform.origin.z;
          minX = Math.min(minX, globalX);
          minY = Math.min(minY, globalY);
          minZ = Math.min(minZ, globalZ);
          maxX = Math.max(maxX, globalX);
          maxY = Math.max(maxY, globalY);
          maxZ = Math.max(maxZ, globalZ);
        }
  
        // Create the transformed AABB
        const minPoint = new Vector3(minX, minY, minZ);
        const maxPoint = new Vector3(maxX, maxY, maxZ);
        const transformedAABB = new AABB(minPoint, maxPoint.subtract(minPoint));
  
        // Merge with combined AABB
        if (!combinedAABB) {
          combinedAABB = transformedAABB;
        } else {
          combinedAABB = combinedAABB.merge(transformedAABB);
        }
      }
    }
    for (const child of currentNode.get_children()) {
      traverseForMeshes(child);
    }
  };
  
  traverseForMeshes(node);
  return combinedAABB;
};