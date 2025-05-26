import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createHash } from "crypto";
import { tmpdir } from "os";
import {
  readdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
  readFile,
  mkdir,
  copyFile,
} from "fs/promises";
import { createReadStream } from "fs";
import { basename, join, extname, sep } from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import pLimit from "p-limit";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";
import archiver from "archiver";
import { convertToWebP } from "./convert.js";

const accountName = "eqrequiem";
const containerName = "requiem";
const rootFolder = "eqrequiem";
const rootPath = process.argv[2] || process.cwd();

const zippedPrefixes = ["eqrequiem/textures"];
let allowedFolders = new Set([
  "data",
  "models",
  "objects",
  "sky",
  "textures",
  "zones",
  "sounds",
  "vat",
]);



const allowedRootFolders = new Set(["uifiles", "eqrequiem"]);
const allowedRootFiles = new Set(["eqstr_us.txt"]);
let allowedExtensions = new Set([
  ".txt",
  ".json",
  ".glb",
  ".webp",
  ".dds",
  ".wav",
  ".mid",
  ".tga",
  ".bin"
]);

const onlyTextures = process.argv[3] && process.argv[3] === 'textures';
if (onlyTextures) {
  console.log('Only textures')
  allowedFolders = new Set([
    "textures",
  ]);
  allowedExtensions = new Set([
    ".dds",
    ".tga",
  ]);
}

const onlyVat = process.argv[3] && process.argv[3] === 'vat';
if (onlyVat) {
  console.log('Only vat')
  allowedFolders = new Set([
    "vat",
  ]);
  allowedExtensions = new Set([
    ".bin",
  ]);
}

const limit = pLimit(20);
const tasks = [];

function getContentType(fileName) {
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".txt")) return "text/plain";
  if (fileName.endsWith(".dds")) return "image/bmp";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".mp3")) return "audio/mpeg";
  if (fileName.endsWith(".mid")) return "audio/midi";
  if (fileName.endsWith(".tga")) return "image/x-targa";
  if (fileName.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

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

async function convertToWebPFile(inputPath, outputDir) {
  const inputBuffer = await readFile(inputPath);
  const arrayBuffer = inputBuffer.buffer.slice(
    inputBuffer.byteOffset,
    inputBuffer.byteOffset + inputBuffer.byteLength,
  );
  const webp = await convertToWebP(arrayBuffer, inputPath);
  const outputPath = join(
    outputDir,
    `${basename(inputPath, extname(inputPath))}.webp`,
  );
  await writeFile(outputPath, webp);
  return outputPath;
}

async function prepareStagingDir(srcDir, stagingDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const srcPath = join(srcDir, entry.name);
    const destPath = join(stagingDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await prepareStagingDir(srcPath, destPath);
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (ext === ".dds" || ext === ".tga") {
        await convertToWebPFile(srcPath, stagingDir);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }
}

async function uploadStreamed(
  blobClient,
  sourceStream,
  blobName,
  localHash,
  metadataHash = null,
) {
  const isGzipped = blobName.endsWith(".gz");
  const contentType = getContentType(
    isGzipped ? blobName.replace(/\.gz$/, "") : blobName,
  );

  const headers = {
    blobContentType: blobName.endsWith(".zip")
      ? "application/zip"
      : contentType,
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

  if (prefix) {
    targetName = `${rootFolder}/${relativeKey}`;
  } else {
    targetName = relativeKey;
  }
  targetName = targetName.toLowerCase();
  console.log('Process file', fullPath)
  if (ext === ".dds" || ext === ".tga") {
    const tempDir = await mkdtemp(join(tmpdir(), "image-webp-"));
    try {
      const webpPath = await convertToWebPFile(fullPath, tempDir);
      targetName = targetName.replace(new RegExp(`${ext}$`, "i"), ".webp");
      src = createReadStream(webpPath);

      const blobClient = containerClient.getBlockBlobClient(targetName);
      const localHash = await calculateFileHashStream(webpPath);
      if (!(await isBlobDifferent(blobClient, webpPath))) {
        await rm(tempDir, { recursive: true, force: true });
        return;
      }
      await uploadStreamed(blobClient, src, targetName, localHash);
      console.log(`Converted and uploaded ${fullPath} → ${targetName}`);
    } catch(e) {
      console.error(`Error processing ${fullPath}:`, e.message);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } else if (relativeKey.startsWith("sounds" + sep)) {
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
    if (ext === ".glb" || ext === '.bin') {
      targetName += ".gz";
      src = createReadStream(fullPath).pipe(createGzip());
    } else {
      src = createReadStream(fullPath);
    }
  } else {
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
  if (onlyVat && !dirPath.includes("vat")) {
    //return;
  }
  const relativeRoot = `${rootFolder}/${relativeBase}`;
  if (
    zippedPrefixes.some(
      (zp) => relativeRoot.startsWith(zp) && relativeRoot !== zp,
    )
  ) {
    const zipName = `${relativeRoot}.zip`;
    await zipAndUploadDirectory(dirPath, containerClient, zipName);
    return;
  }
  const entries = await readdir(dirPath, { withFileTypes: true });

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
    const stagingDir = join(tempDir, "staging");
    await mkdir(stagingDir);
    await prepareStagingDir(dirPath, stagingDir);

    const metadataHash = await calculateDirectoryMetadataHash(dirPath);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    if (!(await isBlobDifferent(blobClient, null, metadataHash))) {
      console.log(`Skipped ${blobName} (directory unchanged)`);
      return;
    }

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(pass);

    const hash = createHash("sha256");
    let totalSize = 0;
    pass.on("data", (chunk) => {
      hash.update(chunk);
      totalSize += chunk.length;
    });

    archive.on("error", (err) => {
      console.error(`Archiver error for ${blobName}:`, err.message);
      pass.destroy(err);
    });
    pass.on("error", (err) => {
      console.error(`PassThrough error for ${blobName}:`, err.message);
    });

    const hashPromise = new Promise((resolve, reject) => {
      pass.on("end", () => resolve(hash.digest("hex")));
      pass.on("error", reject);
    });

    archive.directory(stagingDir, false);
    archive.finalize();

    const [localHash] = await Promise.all([
      hashPromise,
      uploadStreamed(blobClient, pass, blobName, null, metadataHash),
    ]);

    await blobClient.setMetadata({
      filehash: localHash,
      metadatahash: metadataHash,
    });
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

  const rootName = basename(rootPath);
  const onlyRoot = process.argv[3] && process.argv[3] === 'skip';

  if (!onlyRoot && allowedFolders.has(rootName) || allowedRootFolders.has(rootName)) {
    const prefix = allowedFolders.has(rootName);
    tasks.push(
      limit(() => processDirectory(rootPath, container, rootName, prefix)),
    );
  } else {
    for (const entry of await readdir(rootPath, { withFileTypes: true })) {
      const name = entry.name;
      const fullPath = join(rootPath, name);
      if (onlyRoot && name !== 'uifiles') {
        continue;
      }
      if (entry.isDirectory()) {
        if (allowedFolders.has(name)) {
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

uploadFilesToAzure()
  .catch((err) => {
    console.error(err)
  })
  .then(() => {
    console.log('Finished')
  })
  .finally(() => {
    console.log("Done!");
    process.exit(0);
  });
