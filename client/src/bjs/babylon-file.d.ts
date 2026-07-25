export type SerializedBabylonScene = Record<string, unknown> & {
    materials?: Array<{
        plugins?: Record<string, unknown>;
    }>;
};
export declare function prepareSerializedBabylonScene(bytes: ArrayBuffer, label?: string): SerializedBabylonScene;
