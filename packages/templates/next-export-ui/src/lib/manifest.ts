export const WELL_KNOWN_MANIFEST_PATH = '/.well-known/tokenhost/manifest.json';

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
