type BasisTextureResult = {
    layerCount: number;
    useGPUCompression: boolean;
    data: Uint8Array;
    format: number;
    width: number;
    height: number;
};
export declare function loadBasisTexture(engine: any, basisBytes: Uint8Array | ArrayBuffer, forceDecompress?: boolean): Promise<BasisTextureResult>;
export {};
