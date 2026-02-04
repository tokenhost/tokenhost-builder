let cachedAbi: Promise<any[]> | null = null;

async function tryFetch(path: string): Promise<any | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAppAbi(): Promise<any[]> {
  if (!cachedAbi) {
    cachedAbi = (async () => {
      const a = await tryFetch('/abi/App.json');
      const json = a ?? (await tryFetch('/compiled/App.json'));
      if (!json) throw new Error('Unable to load ABI. Expected /abi/App.json or /compiled/App.json');
      if (Array.isArray(json)) return json;
      if (Array.isArray(json?.abi)) return json.abi;
      throw new Error('ABI JSON shape not recognized. Expected an ABI array or an object with an "abi" property.');
    })();
  }
  const abi = await cachedAbi;
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new Error('ABI is empty. Build the app and publish compiled/App.json (or abi/App.json) alongside the UI.');
  }
  return abi;
}
