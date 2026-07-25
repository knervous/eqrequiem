/**
 * Babylon Lite 1.14 packs two RGBA texels per VAT actor but addresses them in
 * one horizontal row. That limits a model to maxTextureWidth / 2 actors and
 * destroys the old texture while an encoded frame may still use it.
 *
 * Share this compatibility transform with every build that hosts the sandbox.
 */
export const babylonLiteVat2dPlugin = {
  name: 'babylon-lite-vat-instance-texture-2d',
  enforce: 'pre' as const,
  transform(source: string, id: string) {
    const normalized = id.replaceAll('\\', '/').split('?', 1)[0]
    if (normalized.endsWith('/@babylonjs/lite/lib/vat/vat-baker.js')) {
      const before = `  const uploadInstances = (params) => {
    const texels = Math.max(2, params.length >> 2);
    if (!instanceTex || texels > instanceTexCap) {
      instanceTex?.destroy();
      instanceTex = device.createTexture({
        size: [texels, 1],
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      instanceTexCap = texels;
      vat.instanceTexture = instanceTex;
    }
    device.queue.writeTexture({ texture: instanceTex }, params.buffer, { offset: params.byteOffset, bytesPerRow: texels * 16, rowsPerImage: 1 }, { width: texels, height: 1 });
  };`
      const after = `  const uploadInstances = (params) => {
    const texels = Math.max(2, params.length >> 2);
    if (!instanceTex || texels > instanceTexCap) {
      let texelCapacity = 2;
      while (texelCapacity < texels) texelCapacity *= 2;
      const maxDimension = device.limits.maxTextureDimension2D;
      const width = Math.min(maxDimension, texelCapacity);
      const height = Math.ceil(texelCapacity / width);
      if (height > maxDimension) {
        throw new RangeError("VAT actor count exceeds this device's 2D texture capacity.");
      }
      const retiredTexture = instanceTex;
      instanceTex = device.createTexture({
        size: [width, height],
        format: "rgba32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      instanceTexCap = width * height;
      vat.instanceTexture = instanceTex;
      if (retiredTexture) {
        (engine._retirements ??= []).push(() => retiredTexture.destroy());
      }
    }
    const width = instanceTex.width;
    const height = Math.ceil(texels / width);
    const upload = texels === width * height
      ? params
      : new Float32Array(width * height * 4);
    if (upload !== params) upload.set(params);
    device.queue.writeTexture(
      { texture: instanceTex },
      upload.buffer,
      { offset: upload.byteOffset, bytesPerRow: width * 16, rowsPerImage: height },
      { width, height }
    );
  };`
      if (!source.includes(before)) {
        throw new Error('Babylon Lite VAT baker changed; update the sandbox 2D compatibility patch.')
      }
      return source.replace(before, after)
    }
    if (normalized.endsWith('/@babylonjs/lite/lib/material/pbr/fragments/vat-fragment.js')) {
      const before = `let vatIdx = i32(\${instanceIndex}) * 2;
let vatA = textureLoad(vatInstanceTex, vec2<i32>(vatIdx, 0), 0);
let vatB = textureLoad(vatInstanceTex, vec2<i32>(vatIdx + 1, 0), 0);`
      const after = `let vatIdx = i32(\${instanceIndex}) * 2;
let vatInstanceSize = textureDimensions(vatInstanceTex);
let vatInstanceWidth = i32(vatInstanceSize.x);
let vatA = textureLoad(vatInstanceTex, vec2<i32>(vatIdx % vatInstanceWidth, vatIdx / vatInstanceWidth), 0);
let vatIdxB = vatIdx + 1;
let vatB = textureLoad(vatInstanceTex, vec2<i32>(vatIdxB % vatInstanceWidth, vatIdxB / vatInstanceWidth), 0);`
      if (!source.includes(before)) {
        throw new Error('Babylon Lite VAT shader changed; update the sandbox 2D compatibility patch.')
      }
      return source.replaceAll(before, after)
    }
  },
}
