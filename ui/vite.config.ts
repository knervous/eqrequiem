import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs/promises';
import path from 'path';

const fileProxyMiddleware = async (req, res, next) => {
  if (req.method !== 'GET' || !req.url.startsWith('/file')) {
    return next();
  }

  console.log(`[${new Date().toISOString()}] File request: ${req.url}`);
  
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const filePathParam = decodeURIComponent(url.searchParams.get('path')?.trim());
    const fileParam = decodeURIComponent(url.searchParams.get('file')?.trim());

    if (!filePathParam || !fileParam || 
        filePathParam.includes('..') || 
        fileParam.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid path parameters');
      return;
    }

    const rootPath = process.env.FILE_ROOT_PATH || '/Users/Paul/documents/everquest_rof2/';
    const fullPath = path.resolve(rootPath, filePathParam, fileParam);

    if (!fullPath.startsWith(rootPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access denied: Path outside root directory');
      return;
    }

    const fileBuffer = await fs.readFile(fullPath);
    const contentType = 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length,
    });
    res.end(fileBuffer);
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 500;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 404 ? 'File not found' : `Server error: ${error.message}`);
  }
};

export default defineConfig({
  plugins: [react(), {
    configureServer: (server) => {
      server.middlewares.use(fileProxyMiddleware);
    },
  }],
  server: {
    port: 4100,
  },
});