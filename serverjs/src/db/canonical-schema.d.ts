import type { DatabaseBackend } from "./backend.js";
export declare function applyCanonicalContentSchema(database: DatabaseBackend): Promise<void>;
export declare function applyCanonicalRuntimeSchema(database: DatabaseBackend): Promise<void>;
