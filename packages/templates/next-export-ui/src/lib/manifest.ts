export const WELL_KNOWN_MANIFEST_PATH = '/.well-known/tokenhost/manifest.json';
export type TxMode = 'userPays' | 'sponsored';
export type UploadRunnerMode = 'local' | 'remote' | 'foc-process';

let cached: Promise<any> | null = null;

async function tryFetchJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchManifest(): Promise<any> {
  if (!cached) {
    cached = (async () => {
      const a = await tryFetchJson(WELL_KNOWN_MANIFEST_PATH);
      if (a) return a;
      const b = await tryFetchJson('/manifest.json');
      if (b) return b;
      throw new Error(`Unable to load manifest from ${WELL_KNOWN_MANIFEST_PATH} or /manifest.json`);
    })();
  }
  return cached;
}

export function getPrimaryDeployment(manifest: any): any {
  const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
  const primary = deployments.find((d) => d && d.role === 'primary');
  return primary ?? deployments[0] ?? null;
}

export function getTxMode(manifest: any): TxMode {
  const mode = String(manifest?.extensions?.tx?.mode ?? '').trim();
  if (mode === 'sponsored') return 'sponsored';
  return 'userPays';
}

export function getRelayBaseUrl(manifest: any): string {
  const configured = String(manifest?.extensions?.tx?.sponsored?.relayBaseUrl ?? '').trim();
  if (configured) return configured;
  return '/__tokenhost/relay';
}

export function uploadsEnabled(manifest: any): boolean {
  const extEnabled = manifest?.extensions?.uploads?.enabled;
  if (typeof extEnabled === 'boolean') return extEnabled;
  return Boolean(manifest?.features?.uploads);
}

export function getUploadBaseUrl(manifest: any): string {
  const configured = String(manifest?.extensions?.uploads?.baseUrl ?? '').trim();
  if (configured) return configured;
  return '/__tokenhost/upload';
}

export function getUploadEndpointUrl(manifest: any): string {
  const configured = String(manifest?.extensions?.uploads?.endpointUrl ?? '').trim();
  if (configured) return configured;
  return getUploadBaseUrl(manifest);
}

export function getUploadStatusUrl(manifest: any): string {
  const configured = String(manifest?.extensions?.uploads?.statusUrl ?? '').trim();
  if (configured) return configured;
  return getUploadEndpointUrl(manifest);
}

export function getUploadRunnerMode(manifest: any): UploadRunnerMode {
  const mode = String(manifest?.extensions?.uploads?.runnerMode ?? '').trim();
  if (mode === 'remote') return 'remote';
  if (mode === 'foc-process') return 'foc-process';
  return 'local';
}
