import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import fs from 'node:fs';
import path from 'node:path';

const accountName = "eqrequiem";
const containerName = "dev";


async function uploadFilesToAzure() {
  const cred = new DefaultAzureCredential();
  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    cred,
  );
  const container = service.getContainerClient(containerName);

  const dbFileStream = fs.createReadStream(path.join('../', 'server/eqgo.sql.gz'));
  const blobClient = container.getBlockBlobClient('eqgo.sql.gz');
  await blobClient.uploadStream(dbFileStream, 4 * 1024 * 1024, 5).catch(e => {
    console.error(`Failed to upload DB:`, e.message);
  })
  console.log(`Uploaded DB to Azure Blob Storage`);
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
