/**
 * Kept as source text so the storage entry point can run from a package,
 * Vite source mode, or a CDN without relying on a separately emitted worker.
 */
export const OPFS_DEFERRED_STORAGE_WORKER_SOURCE = String.raw`
let directory;
let fileName = "";
let access;

function reply(id, result, transfer) {
  self.postMessage({ id, ok: true, result }, transfer || []);
}

function fail(id, error) {
  self.postMessage({
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function resolveDirectory(segments) {
  let next = await navigator.storage.getDirectory();
  for (const segment of segments) {
    next = await next.getDirectoryHandle(segment, { create: true });
  }
  return next;
}

self.onmessage = async event => {
  const message = event.data;
  const id = message.id;
  try {
    switch (message.type) {
      case "open": {
        directory = await resolveDirectory(message.directory);
        fileName = message.fileName;
        const file = await directory.getFileHandle(fileName, { create: true });
        access = await file.createSyncAccessHandle();
        const existingByteLength = access.getSize();
        if (existingByteLength < message.minimumByteLength) {
          access.truncate(message.minimumByteLength);
          access.flush();
        }
        reply(id, { byteLength: access.getSize() });
        break;
      }
      case "map": {
        if (!access) throw new Error("Deferred storage is not open");
        const length = message.byteLength;
        const buffer = message.sharedBuffer || new ArrayBuffer(length);
        const bytes = new Uint8Array(buffer, 0, length);
        bytes.fill(0);
        const bytesRead = access.read(bytes, { at: message.byteOffset });
        if (message.sharedBuffer) {
          reply(id, { bytesRead, shared: true });
        } else {
          reply(id, { bytesRead, buffer }, [buffer]);
        }
        break;
      }
      case "flush": {
        if (!access) throw new Error("Deferred storage is not open");
        const payload = new Uint8Array(message.payload);
        let bytesWritten = 0;
        for (const range of message.ranges) {
          const source = payload.subarray(
            range.payloadOffset,
            range.payloadOffset + range.byteLength
          );
          bytesWritten += access.write(source, { at: range.fileOffset });
        }
        if (message.synchronize) access.flush();
        reply(id, { bytesWritten });
        break;
      }
      case "sync": {
        if (!access) throw new Error("Deferred storage is not open");
        access.flush();
        reply(id, {});
        break;
      }
      case "resize": {
        if (!access) throw new Error("Deferred storage is not open");
        access.truncate(message.byteLength);
        access.flush();
        reply(id, { byteLength: access.getSize() });
        break;
      }
      case "close": {
        if (access) {
          access.flush();
          access.close();
          access = undefined;
        }
        reply(id, {});
        break;
      }
      case "destroy": {
        if (access) {
          access.close();
          access = undefined;
        }
        if (directory && fileName) {
          await directory.removeEntry(fileName);
        }
        reply(id, {});
        break;
      }
      default:
        throw new Error("Unknown deferred-storage request: " + message.type);
    }
  } catch (error) {
    fail(id, error);
  }
};
`;
