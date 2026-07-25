let rootFileSystemHandle: FileSystemDirectoryHandle | null = null;
let requiemDirectory: FileSystemDirectoryHandle | null = null;
const directoryCache = new Map<string, FileSystemDirectoryHandle>();

export function configureRootFileSystem(
  handle: FileSystemDirectoryHandle,
): void {
  if (rootFileSystemHandle === handle) return;
  rootFileSystemHandle = handle;
  requiemDirectory = null;
  directoryCache.clear();
}

function requireRoot(): FileSystemDirectoryHandle {
  if (!rootFileSystemHandle) {
    throw new Error('The Requiem filesystem has not been configured.');
  }
  return rootFileSystemHandle;
}

async function getRequiemDirectory(): Promise<FileSystemDirectoryHandle> {
  requiemDirectory ??= await requireRoot().getDirectoryHandle('eqrequiem', {
    create: true,
  });
  return requiemDirectory;
}

async function getDirectory(name: string): Promise<FileSystemDirectoryHandle> {
  if (name === 'root') return requireRoot();
  let handle = directoryCache.get(name);
  if (!handle) {
    handle = await (await getRequiemDirectory()).getDirectoryHandle(name, {
      create: true,
    });
    directoryCache.set(name, handle);
  }
  return handle;
}

export async function getRootEQFile(
  folderPath: string,
  fileName: string,
): Promise<ArrayBuffer | undefined> {
  let directory = requireRoot();
  for (const segment of folderPath.split('/').filter(Boolean)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch {
      return undefined;
    }
  }
  try {
    return await (await (await directory.getFileHandle(fileName)).getFile()).arrayBuffer();
  } catch {
    return undefined;
  }
}

export async function writeRootEQFile(
  folderPath: string,
  fileName: string,
  data: FileSystemWriteChunkType,
): Promise<boolean> {
  let directory = requireRoot();
  for (const segment of folderPath.split('/').filter(Boolean)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  try {
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch (error) {
    console.error(`Failed to write ${folderPath}/${fileName}:`, error);
    return false;
  }
}

export async function getEQFile(
  directoryName: string,
  fileName: string,
  type?: 'arrayBuffer',
): Promise<ArrayBuffer | null>;
export async function getEQFile(
  directoryName: string,
  fileName: string,
  type: 'text',
): Promise<string | null>;
export async function getEQFile<T = unknown>(
  directoryName: string,
  fileName: string,
  type: 'json',
): Promise<T | null>;
export async function getEQFile<T = unknown>(
  directoryName: string,
  fileName: string,
  type: 'arrayBuffer' | 'text' | 'json' = 'arrayBuffer',
): Promise<ArrayBuffer | string | T | null> {
  try {
    const directory = await getDirectory(directoryName);
    const buffer = await (
      await (await directory.getFileHandle(fileName)).getFile()
    ).arrayBuffer();
    if (type === 'text') return new TextDecoder().decode(buffer);
    if (type === 'json') {
      try {
        return JSON.parse(new TextDecoder().decode(buffer)) as T;
      } catch {
        return {} as T;
      }
    }
    return buffer;
  } catch {
    return null;
  }
}
