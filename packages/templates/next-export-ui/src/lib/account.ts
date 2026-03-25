'use client';

const ACCOUNT_STORAGE_KEY = 'TH_ACCOUNT';
const ACCOUNT_EVENT_NAME = 'tokenhost:account-changed';

function currentWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

export function getStoredAccount(): string | null {
  const win = currentWindow();
  if (!win) return null;
  try {
    return win.localStorage.getItem(ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccount(account: string | null): void {
  const win = currentWindow();
  if (!win) return;
  try {
    if (account) {
      win.localStorage.setItem(ACCOUNT_STORAGE_KEY, account);
    } else {
      win.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  try {
    win.dispatchEvent(new CustomEvent(ACCOUNT_EVENT_NAME, { detail: { account } }));
  } catch {
    // ignore
  }
}

export function subscribeStoredAccount(callback: (account: string | null) => void): () => void {
  const win = currentWindow();
  if (!win) return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== ACCOUNT_STORAGE_KEY) return;
    callback(getStoredAccount());
  };

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ account?: string | null }>).detail;
    callback(detail?.account ?? getStoredAccount());
  };

  win.addEventListener('storage', handleStorage);
  win.addEventListener(ACCOUNT_EVENT_NAME, handleCustom as EventListener);
  return () => {
    win.removeEventListener('storage', handleStorage);
    win.removeEventListener(ACCOUNT_EVENT_NAME, handleCustom as EventListener);
  };
}
