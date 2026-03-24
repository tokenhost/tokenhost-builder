'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getUploadConfig, uploadFile, type UploadStateUpdate } from '../lib/upload';

export default function ImageFieldInput(props: {
  manifest: any | null;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { manifest, value, disabled, onChange, onBusyChange } = props;
  const config = useMemo(() => getUploadConfig(manifest), [manifest]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadStateUpdate['phase']>('requesting');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [lastSelectedFile, setLastSelectedFile] = useState<File | null>(null);
  const previewUrl = localPreviewUrl || value || '';

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  async function handleFile(file: File) {
    setLastSelectedFile(file);
    setError(null);
    setStatus(null);
    setProgress(0);

    if (!config) {
      setError('Uploads are not enabled for this app.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(objectUrl);
    setBusy(true);
    onBusyChange?.(true);
    setPhase('requesting');
    setStatus(`Uploading via ${config.runnerMode}…`);

    try {
      const uploaded = await uploadFile({
        manifest,
        file,
        onProgress: setProgress,
        onStateChange: (next) => {
          setPhase(next.phase);
          setProgress(next.progress);
          setStatus(
            next.elapsedMs && next.phase === 'processing'
              ? `${next.message} ${Math.max(1, Math.round(next.elapsedMs / 1000))}s elapsed.`
              : next.message
          );
        }
      });
      onChange(uploaded.url);
      setStatus(uploaded.cid ? `Uploaded (${uploaded.cid.slice(0, 12)}…).` : 'Uploaded.');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="fieldGroup">
      <div className="actionGroup" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={Boolean(disabled || busy || !config)}
          onClick={() => inputRef.current?.click()}
          title={config ? `Upload image via ${config.runnerMode}` : 'Uploads disabled'}
        >
          {busy ? `Uploading ${progress}%` : 'Choose image'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(disabled || busy || !value)}
          onClick={() => {
            onChange('');
            setStatus(null);
            setError(null);
            setProgress(0);
            if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
            setLocalPreviewUrl(null);
          }}
        >
          Remove
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(disabled || busy || !lastSelectedFile)}
          onClick={() => {
            if (lastSelectedFile) void handleFile(lastSelectedFile);
          }}
        >
          Retry
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={config?.accept?.join(',') || 'image/*'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.currentTarget.value = '';
        }}
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="preview" style={{ maxWidth: 320, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 8 }} />
      ) : null}

      <input
        className="input"
        type="text"
        value={value}
        disabled={Boolean(disabled || busy)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config ? 'Uploaded image URL/CID appears here' : 'image URL or CID'}
      />

      {config ? (
        <div className="muted" style={{ marginTop: 8 }}>
          {busy
            ? phase === 'processing' || phase === 'accepted'
              ? `Long-running upload: Token Host is finalizing this media item via ${config.provider || config.runnerMode}.`
              : `Upload in progress via ${config.provider || config.runnerMode}.`
            : `Uploads run via ${config.provider || config.runnerMode}.`}
        </div>
      ) : null}
      {status ? <div className="muted" style={{ marginTop: 8 }}>{status}</div> : null}
      {error ? <div className="pre" style={{ marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
