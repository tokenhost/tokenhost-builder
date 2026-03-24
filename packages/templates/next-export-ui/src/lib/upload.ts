'use client';

import { getUploadEndpointUrl, getUploadRunnerMode, getUploadStatusUrl, uploadsEnabled } from './manifest';

export type UploadResult = {
  url: string;
  cid: string | null;
  size: number | null;
  provider: string | null;
  runnerMode: string | null;
  contentType: string | null;
  metadata: Record<string, unknown>;
};

export type UploadConfig = {
  enabled: boolean;
  endpointUrl: string;
  statusUrl: string;
  runnerMode: string;
  provider: string | null;
  accept: string[];
  maxBytes: number | null;
};

async function buildUploadNetworkError(config: UploadConfig, xhr: XMLHttpRequest): Promise<string> {
  const parts = [
    `Upload request failed before the server returned a usable response.`,
    `Endpoint: ${config.endpointUrl}.`
  ];

  if (xhr.status) {
    parts.push(`HTTP ${xhr.status}${xhr.statusText ? ` ${xhr.statusText}` : ''}.`);
  }

  try {
    const res = await fetch(config.statusUrl, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (body && typeof body === 'object') {
      const enabled = body.enabled === true ? 'enabled' : 'disabled';
      const provider = body.provider ? `provider=${String(body.provider)}` : null;
      const runner = body.runnerMode ? `runner=${String(body.runnerMode)}` : null;
      const reason = body.reason ? `reason=${String(body.reason)}` : null;
      const statusBits = [enabled, provider, runner, reason].filter(Boolean);
      if (statusBits.length > 0) {
        parts.push(`Upload status: ${statusBits.join(', ')}.`);
      }
    }
  } catch {
    // ignore status enrichment failures
  }

  return parts.join(' ');
}

function normalizeUrl(value: string, fallback: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function parseAcceptList(manifest: any): string[] {
  const value = manifest?.extensions?.uploads?.accept;
  return Array.isArray(value) ? value.map((x: any) => String(x)).filter(Boolean) : [];
}

function parseMaxBytes(manifest: any): number | null {
  const value = manifest?.extensions?.uploads?.maxBytes;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getUploadConfig(manifest: any): UploadConfig | null {
  if (!uploadsEnabled(manifest)) return null;
  return {
    enabled: true,
    endpointUrl: normalizeUrl(getUploadEndpointUrl(manifest), '/__tokenhost/upload'),
    statusUrl: normalizeUrl(getUploadStatusUrl(manifest), '/__tokenhost/upload'),
    runnerMode: getUploadRunnerMode(manifest),
    provider: manifest?.extensions?.uploads?.provider ? String(manifest.extensions.uploads.provider) : null,
    accept: parseAcceptList(manifest),
    maxBytes: parseMaxBytes(manifest)
  };
}

export async function uploadFile(args: {
  manifest: any;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<UploadResult> {
  const config = getUploadConfig(args.manifest);
  if (!config) throw new Error('Uploads are not enabled for this app.');

  if (config.maxBytes !== null && args.file.size > config.maxBytes) {
    throw new Error(`File exceeds upload limit (${config.maxBytes} bytes).`);
  }

  if (config.accept.length > 0 && args.file.type) {
    const ok = config.accept.some((pattern) => {
      if (pattern === '*/*') return true;
      if (pattern.endsWith('/*')) return args.file.type.startsWith(pattern.slice(0, -1));
      return args.file.type === pattern;
    });
    if (!ok) throw new Error(`Unsupported file type "${args.file.type}".`);
  }

  return await new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', config.endpointUrl, true);
    xhr.responseType = 'text';
    xhr.timeout = 5 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', args.file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-TokenHost-Upload-Filename', args.file.name || 'upload.bin');
    xhr.setRequestHeader('X-TokenHost-Upload-Size', String(args.file.size));

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !args.onProgress) return;
      args.onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };

    xhr.onerror = () => {
      void (async () => reject(new Error(await buildUploadNetworkError(config, xhr))))();
    };
    xhr.onabort = () => reject(new Error('Upload request was aborted.'));
    xhr.ontimeout = () => reject(new Error(`Upload timed out after ${Math.round(xhr.timeout / 1000)} seconds.`));
    xhr.onload = () => {
      let body: any = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }

      if (xhr.status < 200 || xhr.status >= 300 || !body?.ok || !body?.upload?.url) {
        reject(new Error(String(body?.error ?? `Upload failed (HTTP ${xhr.status}).`)));
        return;
      }

      resolve({
        url: String(body.upload.url),
        cid: body.upload.cid ? String(body.upload.cid) : null,
        size: Number.isFinite(Number(body.upload.size)) ? Number(body.upload.size) : null,
        provider: body.upload.provider ? String(body.upload.provider) : config.provider,
        runnerMode: body.upload.runnerMode ? String(body.upload.runnerMode) : config.runnerMode,
        contentType: body.upload.contentType ? String(body.upload.contentType) : null,
        metadata: body.upload.metadata && typeof body.upload.metadata === 'object' ? body.upload.metadata : {}
      });
    };

    xhr.send(args.file);
  });
}
