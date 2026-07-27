const embeddedGltfImageUrl = /^data:([^#]+\.glb)#image\d+$/i;

export function promotedObjectFileName(model: string): string {
  if (!/^[a-z0-9._-]+$/i.test(model)) {
    throw new Error(`Invalid promoted object model ID '${model}'`);
  }
  return `${model}.glb`;
}

export function isIsolatedPromotedTextureUrl(
  url: string,
  fileName: string,
): boolean {
  const match = embeddedGltfImageUrl.exec(url);
  return !match || match[1] === fileName;
}
