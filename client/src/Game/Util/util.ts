import { BaseMaterial3D, Node3D, MeshInstance3D, Image, ImageTexture, Texture2D, Resource  } from "godot";
import { TextureCache } from "./texture-cache";
import { FileSystem } from "../FileSystem/filesystem";

export const loadNewTexture = async (
  file: string,
  name: string,
  flipY: boolean = false,
): Promise<Texture2D | undefined | null> => {
  const cached = TextureCache.get(file + name);
  if (cached) {
    return cached;
  }
  let buffer = await FileSystem.getFileBytes(file, name);
  if (!buffer) {
    console.log('Missing Buffer', file, name);
    return null;
  }
  buffer = buffer instanceof Uint8Array ? buffer.buffer : buffer;
  const image = new Image();
  let err;
  let needFlip = false;
  if (new DataView(buffer).getUint16(0, true) === 0x4d42) {
    err = image.load_bmp_from_buffer(buffer);
    needFlip = true;
  } else {
    err = image.load_dds_from_buffer(buffer);
  }
  if (err !== 0) {
    console.error("Error loading image from buffer:", err);
    return null;
  }
  const img = ImageTexture.create_from_image(
    image,
  ) as unknown as Texture2D & { flip_y: boolean };
  if (!img) {
    console.error("Error creating ImageTexture from image");
    return null;
  }
  TextureCache.set(file + name, img);
  img.flip_y = needFlip;
  if (flipY) {
    img.flip_y = !img.flip_y;
  }
  return img;
};

export const traverseForMaterials = (node: Node3D): BaseMaterial3D[] => {
  const materials: BaseMaterial3D[] = [];
  if (node instanceof MeshInstance3D) {
    const mesh = node.mesh;
    if (mesh) {
      const surfaceCount = mesh.get_surface_count();
      for (let i = 0; i < surfaceCount; i++) {
        const material =
            node.get_surface_override_material(i) ||
            mesh.surface_get_material(i);
        if (material) {
          materials.push(material as BaseMaterial3D);
        }
      }
    }
  }

  for (const child of node.get_children()) {
    if (child instanceof Node3D) {
      materials.push(...traverseForMaterials(child));
    }
  }
  return materials;
};
