#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function trimTrailingSlash(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function normalizeUploadFileName(fileName) {
  const base = path.basename(fileName || 'upload.bin').replace(/[^A-Za-z0-9._-]+/g, '-');
  return base || 'upload.bin';
}

function detectUploadExtension(fileName, contentType) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '.bin';
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeFocUploadResult(parsed) {
  const result = parsed?.result;
  const copyResults = Array.isArray(result?.copyResults) ? result.copyResults : [];
  const firstCopy = copyResults.find((entry) => entry && typeof entry.url === 'string' && entry.url.trim()) ?? null;
  const url = firstCopy ? String(firstCopy.url) : '';
  if (!url) {
    throw new Error('foc-cli upload did not return a usable copyResults[].url value.');
  }

  return {
    url,
    cid: result?.pieceCid ? String(result.pieceCid) : null,
    size: Number.isFinite(Number(result?.size)) ? Number(result.size) : null,
    metadata: {
      pieceScannerUrl: result?.pieceScannerUrl ? String(result.pieceScannerUrl) : null,
      copyResults,
      copyFailures: Array.isArray(result?.copyFailures) ? result.copyFailures : []
    }
  };
}

function runFocCliUpload(config, filePath) {
  const command =
    `${config.command} upload ${shellQuote(filePath)} --format json --chain ${config.chainId} --copies ${config.copies}` +
    `${config.withCDN ? ' --withCDN true' : ''}`;
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `foc-cli failed with status ${result.status}`));
  }
  return normalizeFocUploadResult(JSON.parse(String(result.stdout || '{}')));
}

function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function contentTypeForPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}

function sendText(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(value);
}

function safeResolveWithin(rootDir, pathname) {
  const candidate = path.resolve(rootDir, `.${pathname}`);
  if (!candidate.startsWith(path.resolve(rootDir))) return null;
  return candidate;
}

const host = String(process.env.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
const port = parsePositiveInt(process.env.PORT, 8788);
const runnerMode = String(process.env.TH_UPLOAD_ADAPTER_MODE ?? process.env.TH_UPLOAD_RUNNER ?? 'local').trim().toLowerCase() === 'foc-process'
  ? 'foc-process'
  : 'local';
const endpointPath = (() => {
  const raw = String(process.env.TH_UPLOAD_ENDPOINT_PATH ?? '/__tokenhost/upload').trim() || '/__tokenhost/upload';
  return raw.startsWith('/') ? raw : `/${raw}`;
})();
const statusPath = (() => {
  const raw = String(process.env.TH_UPLOAD_STATUS_PATH ?? endpointPath).trim() || endpointPath;
  return raw.startsWith('/') ? raw : `/${raw}`;
})();
const publicBaseUrl = trimTrailingSlash(process.env.TH_UPLOAD_PUBLIC_BASE_URL || `http://${host}:${port}`);
const storagePath = (() => {
  const raw = String(process.env.TH_UPLOAD_LOCAL_DIR ?? path.join(process.cwd(), '.tokenhost-upload-adapter')).trim();
  return path.resolve(raw, 'uploads');
})();
const publicUploadsPath = '/uploads';
const accept = String(process.env.TH_UPLOAD_ACCEPT ?? 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const maxBytes = parsePositiveInt(process.env.TH_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
const focConfig = {
  chainId: parsePositiveInt(process.env.TH_UPLOAD_FOC_CHAIN, 314159),
  copies: parsePositiveInt(process.env.TH_UPLOAD_FOC_COPIES, 2),
  withCDN: parseBoolean(process.env.TH_UPLOAD_FOC_WITH_CDN, false),
  command: String(process.env.TH_UPLOAD_FOC_COMMAND ?? 'npx -y foc-cli').trim() || 'npx -y foc-cli'
};

fs.mkdirSync(storagePath, { recursive: true });

const server = http.createServer((req, res) => {
  if (!req.url) return sendText(res, 400, 'Bad Request');

  const pathname = new URL(req.url, `http://${host}:${port}`).pathname || '/';

  if (pathname === endpointPath || pathname === statusPath) {
    (async () => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return sendJson(res, 200, {
          ok: true,
          enabled: true,
          provider: runnerMode === 'foc-process' ? 'filecoin_onchain_cloud' : 'local_file',
          runnerMode,
          endpointUrl: `${publicBaseUrl}${endpointPath}`,
          statusUrl: `${publicBaseUrl}${statusPath}`,
          accept,
          maxBytes
        });
      }

      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, HEAD, POST');
        return sendText(res, 405, 'Method Not Allowed');
      }

      try {
        const fileName = normalizeUploadFileName(String(req.headers['x-tokenhost-upload-filename'] ?? 'upload.bin'));
        const contentType = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
        if (accept.length > 0) {
          const supported = accept.some((pattern) => pattern === contentType || (pattern.endsWith('/*') && contentType.startsWith(pattern.slice(0, -1))));
          if (!supported) return sendJson(res, 415, { ok: false, error: `Unsupported content type "${contentType}".` });
        }

        const body = await readBinaryBody(req, maxBytes);
        if (!body.length) return sendJson(res, 400, { ok: false, error: 'Empty upload body.' });

        if (runnerMode === 'foc-process') {
          const ext = detectUploadExtension(fileName, contentType);
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-foc-remote-'));
          const tempFile = path.join(tempDir, `upload${ext}`);
          fs.writeFileSync(tempFile, body);
          try {
            const uploaded = runFocCliUpload(focConfig, tempFile);
            return sendJson(res, 200, {
              ok: true,
              upload: {
                url: uploaded.url,
                cid: uploaded.cid,
                size: uploaded.size ?? body.length,
                provider: 'filecoin_onchain_cloud',
                runnerMode: 'foc-process',
                contentType,
                metadata: uploaded.metadata
              }
            });
          } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }

        const ext = detectUploadExtension(fileName, contentType);
        const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const storedPath = path.join(storagePath, storedName);
        fs.writeFileSync(storedPath, body);
        return sendJson(res, 200, {
          ok: true,
          upload: {
            url: `${publicBaseUrl}${publicUploadsPath}/${storedName}`,
            cid: null,
            size: body.length,
            provider: 'local_file',
            runnerMode: 'local',
            contentType,
            metadata: {
              storedName
            }
          }
        });
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: String(error?.message ?? error) });
      }
    })();
    return;
  }

  if (pathname.startsWith(`${publicUploadsPath}/`)) {
    const filePath = safeResolveWithin(storagePath, pathname.slice(publicUploadsPath.length));
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return sendText(res, 404, 'Not Found');
    }
    res.statusCode = 200;
    res.setHeader('content-type', contentTypeForPath(filePath));
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (pathname === '/' || pathname === '/healthz') {
    return sendJson(res, 200, {
      ok: true,
      service: 'tokenhost-upload-adapter-example',
      runnerMode,
      endpointUrl: `${publicBaseUrl}${endpointPath}`,
      statusUrl: `${publicBaseUrl}${statusPath}`
    });
  }

  return sendText(res, 404, 'Not Found');
});

server.listen(port, host, () => {
  console.log(`Token Host upload adapter listening at http://${host}:${port}`);
  console.log(`Upload endpoint: ${publicBaseUrl}${endpointPath}`);
  console.log(`Status endpoint: ${publicBaseUrl}${statusPath}`);
});
