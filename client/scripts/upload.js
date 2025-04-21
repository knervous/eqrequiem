import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { readdir, mkdtemp, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import { basename, join, extname, sep } from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import pLimit from "p-limit";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";
import archiver from "archiver";

const accountName = "eqrequiem";
const containerName = "game";
const rootFolder = "eqrequiem";
const rootPath = process.argv[2] || process.cwd();

const zippedPrefixes = ["eqrequiem/textures"];

// folders inside 'eqrequiem'
const allowedFolders = new Set([
  "data",
  "models",
  "objects",
  "sky",
  "textures",
  "zones",
  "sounds",
]);
// root-level folders to upload without prefix
const allowedRootFolders = new Set(["uifiles", "eqrequiem"]);
// root-level files to upload without prefix
const allowedRootFiles = new Set(["eqstr_us.txt"]);
// supported extensions
const allowedExtensions = new Set([
  ".txt",
  ".json",
  ".glb",
  ".dds",
  ".wav",
  ".mid",
  ".tga",
]);

// concurrency limiter (max 20 tasks)
const limit = pLimit(20);

// helper to pick a MIME type based on filename
function getContentType(fileName) {
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".txt")) return "text/plain";
  if (fileName.endsWith(".dds")) return "image/bmp";
  if (fileName.endsWith(".mp3")) return "audio/mpeg";
  if (fileName.endsWith(".mid")) return "audio/midi";
  if (fileName.endsWith(".tga")) return "image/x-targa";
  if (fileName.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

// stream-based SHA-256 hash
async function calculateFileHashStream(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function calculateDirectoryMetadataHash(dirPath) {
  const hash = createHash("sha256");
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subHash = await calculateDirectoryMetadataHash(fullPath);
      hash.update(subHash);
    } else if (entry.isFile()) {
      const stats = await stat(fullPath);
      hash.update(entry.name);
      hash.update(stats.size.toString());
      hash.update(stats.mtime.toISOString());
    }
  }

  return hash.digest("hex");
}

async function isBlobDifferent(blobClient, localPath, metadataHash = null) {
  try {
    const props = await blobClient.getProperties();
    const remoteFileHash = props.metadata?.filehash;
    const remoteMetadataHash = props.metadata?.metadatahash;

    if (metadataHash && remoteMetadataHash === metadataHash) {
      return false;
    }

    if (!localPath) return true;
    const localHash = await calculateFileHashStream(localPath);
    return !remoteFileHash || remoteFileHash !== localHash;
  } catch (err) {
    if (err.statusCode === 404) return true;
    console.warn("getProperties failed, assuming different:", err.message);
    return true;
  }
}

async function uploadStreamed(blobClient, sourceStream, blobName, localHash, metadataHash = null) {
  const isGzipped = blobName.endsWith(".gz");
  const contentType = getContentType(isGzipped ? blobName.replace(/\.gz$/, "") : blobName);

  const headers = {
    blobContentType: blobName.endsWith(".zip") ? "application/zip" : contentType,
  };
  if (isGzipped) {
    headers.blobContentEncoding = "gzip";
  }

  const metadata = { filehash: localHash };
  if (metadataHash) {
    metadata.metadatahash = metadataHash;
  }

  await blobClient.uploadStream(sourceStream, 4 * 1024 * 1024, 5, {
    metadata,
    blobHTTPHeaders: headers,
  });
  console.log(`Uploaded → ${blobName}`);
}

// Convert WAV to MP3 using fluent-ffmpeg
function wavToMp3Stream(filePath) {
  const pass = new PassThrough();
  ffmpeg()
    .input(filePath)
    .format("mp3")
    .audioBitrate(128)
    .on("error", (err) => console.error(`FFmpeg error: ${err.message}`))
    .pipe(pass, { end: true });
  return pass;
}

async function processFile(fullPath, containerClient, relativeKey, prefix) {
  const ext = extname(fullPath).toLowerCase();
  let targetName;
  let src;

  // Base name (with optional prefix)
  if (prefix) {
    targetName = `${rootFolder}/${relativeKey}`;
  } else {
    targetName = relativeKey;
  }

  // Lowercase all blob paths
  targetName = targetName.toLowerCase();

  if (relativeKey.startsWith("sounds" + sep)) {
    // Handle sounds
    if (ext === ".wav") {
      targetName = targetName.replace(/\.wav$/i, ".mp3");
      src = wavToMp3Stream(fullPath);
    } else if (ext === ".mid") {
      src = createReadStream(fullPath);
    } else {
      console.log(`Skipping unsupported sound: ${fullPath}`);
      return;
    }
  } else if (prefix) {
    // Handle assets under eqrequiem
    if (ext === ".glb") {
      targetName += ".gz";
      src = createReadStream(fullPath).pipe(createGzip());
    } else {
      src = createReadStream(fullPath);
    }
  } else {
    // Root-level non-sound asset
    src = createReadStream(fullPath);
  }

  const blobClient = containerClient.getBlockBlobClient(targetName);
  const localHash = await calculateFileHashStream(fullPath);
  if (!(await isBlobDifferent(blobClient, fullPath))) {
    return;
  }
  await uploadStreamed(blobClient, src, targetName, localHash);
}

async function processDirectory(
  dirPath,
  containerClient,
  relativeBase,
  prefix,
) {
  const relativeRoot = `${rootFolder}/${relativeBase}`;
  if (zippedPrefixes.some(zp => relativeRoot.startsWith(zp) && relativeRoot !== zp)) { 
    const zipName = `${relativeRoot}.zip`;
    await zipAndUploadDirectory(dirPath, containerClient, zipName);
    return;
  }
  const entries = await readdir(dirPath, { withFileTypes: true });
  const tasks = [];

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = join(dirPath, entry.name);
    const relKey = join(relativeBase, entry.name);
    const ext = extname(entry.name).toLowerCase();

    if (entry.isDirectory()) {
      tasks.push(
        limit(() =>
          processDirectory(fullPath, containerClient, relKey, prefix),
        ),
      );
    } else {
      if (!allowedExtensions.has(ext)) {
        // console.log(`Skipping unsupported file: ${fullPath}`);
        continue;
      }
      tasks.push(
        limit(() => processFile(fullPath, containerClient, relKey, prefix)),
      );
    }
  }

  await Promise.all(tasks);
}

async function zipAndUploadDirectory(dirPath, containerClient, blobName) {
  const tempDir = await mkdtemp(join(tmpdir(), "zip-upload-"));
  console.log(`Created temp directory: ${tempDir}`);

  try {
    // Preflight metadata hash check
    const metadataHash = await calculateDirectoryMetadataHash(dirPath);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    if (!(await isBlobDifferent(blobClient, null, metadataHash))) {
      console.log(`Skipped ${blobName} (directory unchanged)`);
      return;
    }

    // Create a PassThrough stream for the zip
    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });

    // Pipe archive to PassThrough
    archive.pipe(pass);

    // Compute hash while streaming
    const hash = createHash("sha256");
    let totalSize = 0;
    pass.on("data", (chunk) => {
      hash.update(chunk);
      totalSize += chunk.length;
    });

    // Error handling for archive
    archive.on("error", (err) => {
      console.error(`Archiver error for ${blobName}:`, err.message);
      pass.destroy(err); // Explicitly destroy the PassThrough stream
    });

    // Handle PassThrough errors
    pass.on("error", (err) => {
      console.error(`PassThrough error for ${blobName}:`, err.message);
    });

    // Log progress
    archive.on("progress", (data) => {
      // console.log(`Archiver progress for ${blobName}:`, data);
    });

    // Resolve hash when stream ends
    const hashPromise = new Promise((resolve, reject) => {
      pass.on("end", () => resolve(hash.digest("hex")));
      pass.on("error", reject);
    });

    // Add directory to archive and finalize
    archive.directory(dirPath, false);
    archive.finalize();

    // Upload stream and compute hash concurrently
    const [localHash] = await Promise.all([
      hashPromise,
      uploadStreamed(blobClient, pass, blobName, null, metadataHash), // Pass null for localHash temporarily
    ]);

    // Update metadata with final hash
    await blobClient.setMetadata({ filehash: localHash, metadatahash: metadataHash });
    console.log(`Uploaded ${blobName} (${totalSize} bytes)`);
  } catch (err) {
    console.error(`Failed to process ${blobName}:`, err.message);
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    console.log(`Cleaned up temp directory: ${tempDir}`);
  }
}


async function uploadFilesToAzure() {
  const cred = new DefaultAzureCredential();
  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    cred,
  );
  const container = service.getContainerClient(containerName);
  const tasks = [];

  const rootName = basename(rootPath);

  // If the script was invoked inside one of the supported folders,
  // skip the root‑level scan and just process that folder.
  if (allowedFolders.has(rootName) || allowedRootFolders.has(rootName)) {
    const prefix = allowedFolders.has(rootName);
    tasks.push(
      limit(() => processDirectory(rootPath, container, rootName, prefix)),
    );
  } else {
    // Otherwise, scan the rootPath directory as before
    for (const entry of await readdir(rootPath, { withFileTypes: true })) {
      const name = entry.name;
      const fullPath = join(rootPath, name);

      if (entry.isDirectory()) {
        if (allowedFolders.has(name)) {
          // e.g. data/, models/, … → relBase=name, prefix=true
          tasks.push(
            limit(() => processDirectory(fullPath, container, name, true)),
          );
        } else if (allowedRootFolders.has(name)) {
          if (name === rootFolder) {
            tasks.push(
              limit(() => processDirectory(fullPath, container, "", true)),
            );
          } else {
            tasks.push(
              limit(() => processDirectory(fullPath, container, name, false)),
            );
          }
        }
      } else if (entry.isFile() && allowedRootFiles.has(name)) {
        tasks.push(limit(() => processFile(fullPath, container, name, false)));
      }
    }
  }

  await Promise.all(tasks);
  console.log("All uploads complete.");
}

uploadFilesToAzure().catch((err) => console.error(err));
