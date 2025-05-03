import { BaseMaterial3D, Node3D, MeshInstance3D, Image, ImageTexture, Texture2D, StandardMaterial3D  } from "godot";
import { FileSystem } from "../FileSystem/filesystem";
import { TextureCache } from "@game/Util/texture-cache";

const textureMaps ={
  dwfhe0001: "dwfhe0011",
  dwfhe0002: "dwfhe0012",
  hufhe0001: "hufhe0011",
  hufhe0002: "hufhe0012",
}; 

export const getMaterialsByName = (node: MeshInstance3D, regex: RegExp): StandardMaterial3D[] => {
  const mats: StandardMaterial3D[] = [];
  if (node === undefined) {  
    return mats;
  }
  const mesh = node.mesh;
  if (mesh) {
    const surfaceCount = mesh.get_surface_count();
    for (let i = 0; i < surfaceCount; i++) {
      const material =
          node.get_surface_override_material(i) ||
          mesh.surface_get_material(i);
      if (regex.test(material.resource_name)) {
        mats.push(material as StandardMaterial3D);
      }
    }
  }
  for (const child of node.get_children()) {
    if (child instanceof Node3D) {
      mats.push(...getMaterialsByName(child as MeshInstance3D, regex));
    }
  }

  return mats;
};

export const loadNewTexture = async (
  file: string,
  name: string,
  flipY: boolean = false,
): Promise<Texture2D | undefined | null> => {
  if (name in textureMaps) {
    name = textureMaps[name];
  }
  const cached = TextureCache.get(file + name);
  if (cached) {
    return cached;
  }
  let buffer = await FileSystem.getFileBytes(
    "eqrequiem/textures/" + file,
    name + ".dds",
  );
  if (!buffer) {
    console.log("Missing Buffer", file, name);
    return null;
  }
  buffer = buffer instanceof Uint8Array ? buffer.buffer : buffer;
  if (!(buffer instanceof ArrayBuffer)) {
    console.error("Buffer must be an ArrayBuffer or Uint8Array", file, name);
    throw new Error("Buffer must be an ArrayBuffer or Uint8Array");
  }
  // Check if buffer is large enough for getUint16 (at least 2 bytes)
  if (buffer.byteLength < 2) {
    console.error("Buffer is too small to read image header", file);
    throw new Error("Buffer is too small to read image header");
  }
  const image = new Image();
  let err;
  let needFlip = false;
  if (new DataView(buffer).getUint16(0, true) === 0x4d42) {
    err = image.load_bmp_from_buffer(buffer);
    needFlip = true;
  } else {
    err = image.load_dds_from_buffer(buffer);
    image.decompress();
    image.generate_mipmaps(false);
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
