'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ImageFieldInput from './ImageFieldInput';
import TxStatus, { type TxPhase } from './TxStatus';
import { fnCreate } from '../lib/app';
import { chainWithRpcOverride, requestWalletAddress } from '../lib/clients';
import { getReadRpcUrl } from '../lib/manifest';
import { submitWriteTx } from '../lib/tx';
import { listOwnedProfiles, loadMicroblogRuntime, profileHandle, profileLabel, type ProfileRecord } from '../lib/microblog';

type ComposeState = {
  loading: boolean;
  runtimeError: string | null;
  connectError: string | null;
  submitError: string | null;
};

const PROFILE_STORAGE_PREFIX = 'TH_MICROBLOG_PROFILE_ID:';

export default function MicroblogComposeClient() {
  const router = useRouter();
  const [state, setState] = useState<ComposeState>({
    loading: true,
    runtimeError: null,
    connectError: null,
    submitError: null
  });
  const [runtime, setRuntime] = useState<any | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState('');
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loadedRuntime = await loadMicroblogRuntime();
        if (cancelled) return;
        setRuntime(loadedRuntime);

        try {
          const cached = localStorage.getItem('TH_ACCOUNT');
          if (cached && !cancelled) setAccount(cached);
        } catch {
          // ignore
        }
      } catch (error: any) {
        if (cancelled) return;
        setState((prev) => ({ ...prev, runtimeError: String(error?.message ?? error), loading: false }));
        return;
      }

      if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!runtime || !account) {
      setProfiles([]);
      setSelectedProfileId('');
      return;
    }

    setState((prev) => ({ ...prev, loading: true, connectError: null }));
    void (async () => {
      try {
        const ownedProfiles = await listOwnedProfiles(runtime, account);
        if (cancelled) return;
        setProfiles(ownedProfiles);

        let preferred = '';
        try {
          const stored = localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`) ?? '';
          if (stored && ownedProfiles.some((entry) => String(entry.id) === stored)) preferred = stored;
        } catch {
          // ignore
        }
        if (!preferred && ownedProfiles[0]) preferred = String(ownedProfiles[0].id);
        setSelectedProfileId(preferred);
      } catch (error: any) {
        if (cancelled) return;
        setState((prev) => ({ ...prev, connectError: String(error?.message ?? error) }));
      } finally {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtime, account]);

  useEffect(() => {
    if (!account || !selectedProfileId) return;
    try {
      localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${account.toLowerCase()}`, selectedProfileId);
    } catch {
      // ignore
    }
  }, [account, selectedProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((entry) => String(entry.id) === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );
  const walletChain = useMemo(
    () => (runtime ? chainWithRpcOverride(runtime.chain, getReadRpcUrl(runtime.manifest) || undefined) : null),
    [runtime]
  );

  async function connectWallet() {
    if (!walletChain) return;
    setState((prev) => ({ ...prev, connectError: null }));
    try {
      const nextAccount = await requestWalletAddress(walletChain);
      setAccount(nextAccount);
      try {
        localStorage.setItem('TH_ACCOUNT', nextAccount);
      } catch {
        // ignore
      }
    } catch (error: any) {
      setState((prev) => ({ ...prev, connectError: String(error?.message ?? error) }));
    }
  }

  async function submit() {
    if (!runtime || !walletChain || !selectedProfile || !body.trim()) return;

    setState((prev) => ({ ...prev, submitError: null }));
    setTxStatus(null);
    setTxPhase('idle');
    setTxHash(null);

    try {
      const result = await submitWriteTx({
        manifest: runtime.manifest,
        deployment: runtime.deployment,
        chain: walletChain,
        publicClient: runtime.publicClient,
        address: runtime.appAddress,
        abi: runtime.abi,
        functionName: fnCreate('Post'),
        contractArgs: [
          {
            authorProfile: selectedProfile.id,
            body: body.trim(),
            image: image.trim()
          }
        ],
        setStatus: setTxStatus,
        onPhase: setTxPhase,
        onHash: setTxHash
      });

      setTxStatus(`Posted (${result.hash.slice(0, 10)}…).`);
      router.push('/');
      router.refresh();
    } catch (error: any) {
      setState((prev) => ({ ...prev, submitError: String(error?.message ?? error) }));
      setTxStatus(null);
      setTxPhase('failed');
    }
  }

  if (state.loading && !runtime) {
    return (
      <section className="card">
        <h2>Loading composer…</h2>
        <p className="muted">Resolving the active deployment and wallet state.</p>
      </section>
    );
  }

  if (state.runtimeError) {
    return (
      <section className="card">
        <div className="eyebrow">/compose/error</div>
        <h2>Unable to load composer</h2>
        <p className="muted">{state.runtimeError}</p>
      </section>
    );
  }

  return (
    <div className="pageStack">
      <section className="card heroPanel">
        <div className="heroSplit">
          <div>
            <div className="heroTopline">
              <span className="eyebrow">/post/compose</span>
              <div className="chipRow">
                <span className="badge">normalized author identity</span>
                <span className="badge">profile-linked posts</span>
              </div>
            </div>
            <h2 className="displayTitle">
              Compose as a profile
              <br />
              <span>not as a copied handle string.</span>
            </h2>
            <p className="lead">
              Posts now store <span className="badge">authorProfile</span> as an on-chain reference to <span className="badge">Profile</span>,
              so handle and avatar changes flow through existing posts automatically.
            </p>
            <div className="actionGroup">
              <Link className="btn" href="/">Back to feed</Link>
              <Link className="btn" href="/Profile/">Browse profiles</Link>
            </div>
          </div>

          <div className="heroDataPanel">
            <div className="eyebrow">/identity</div>
            <div className="heroStatGrid">
              <div className="heroStat">
                <div className="heroStatValue">{account ? 1 : 0}</div>
                <div className="heroStatLabel">Wallet linked</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{profiles.length}</div>
                <div className="heroStatLabel">Owned profiles</div>
              </div>
            </div>
            <div className="heroMeta">
              <span className="badge">posts reference profiles</span>
              <span className="badge">profile changes propagate</span>
            </div>
          </div>
        </div>
      </section>

      {!account ? (
        <section className="card">
          <div className="eyebrow">/wallet</div>
          <h3>Connect a wallet to compose</h3>
          <p className="muted">Posting now requires selecting one of your on-chain profiles. Connect the wallet that owns the profile first.</p>
          <div className="actionGroup">
            <button className="btn primary" onClick={() => void connectWallet()}>Connect wallet</button>
          </div>
          {state.connectError ? <p className="muted">{state.connectError}</p> : null}
        </section>
      ) : null}

      {account && !profiles.length ? (
        <section className="card">
          <div className="eyebrow">/profiles/empty</div>
          <h3>No owned profiles found</h3>
          <p className="muted">Create a profile first. Once it exists on-chain under this wallet, you can compose posts as that profile.</p>
          <div className="actionGroup">
            <Link className="btn primary" href="/Profile/?mode=new">Create profile</Link>
          </div>
          {state.connectError ? <p className="muted">{state.connectError}</p> : null}
        </section>
      ) : null}

      {account && profiles.length ? (
        <section className="card" style={{ display: 'grid', gap: 18 }}>
          <div>
            <h2>Compose Post</h2>
            <p className="muted">Choose the on-chain profile identity for this post, then write the post body and optional image.</p>
          </div>

          <div className="formGrid">
            <div className="fieldGroup">
              <label className="label">Profile</label>
              <select
                className="select"
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                {profiles.map((entry) => (
                  <option key={String(entry.id)} value={String(entry.id)}>
                    {profileLabel(entry.record)}
                  </option>
                ))}
              </select>
            </div>

            <div className="fieldGroup">
              <label className="label">Current identity</label>
              <div className="recordPreviewCell" style={{ minHeight: 110 }}>
                {selectedProfile ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div className="chipRow">
                      <span className="badge">profile #{String(selectedProfile.id)}</span>
                      {profileHandle(selectedProfile.record) ? <span className="badge">@{profileHandle(selectedProfile.record)}</span> : null}
                    </div>
                    <strong>{profileLabel(selectedProfile.record)}</strong>
                    {String(selectedProfile.record?.bio ?? '').trim() ? (
                      <p className="muted" style={{ margin: 0 }}>{String(selectedProfile.record.bio)}</p>
                    ) : null}
                  </div>
                ) : (
                  <span className="muted">Select a profile.</span>
                )}
              </div>
            </div>

            <div className="fieldGroup">
              <label className="label">Body <span className="badge">required</span></label>
              <textarea
                className="input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Share something on-chain. Hashtags like #tokenhost or #microblog will be indexed automatically."
                rows={6}
                style={{ resize: 'vertical', minHeight: 160 }}
              />
            </div>

            <div className="fieldGroup">
              <label className="label">Image</label>
              <ImageFieldInput manifest={runtime?.manifest ?? null} value={image} onChange={setImage} />
            </div>
          </div>

          <div className="actionGroup">
            <button
              className="btn primary"
              onClick={() => void submit()}
              disabled={!selectedProfile || !body.trim() || txPhase === 'submitting' || txPhase === 'submitted' || txPhase === 'confirming'}
            >
              Publish post
            </button>
            <Link className="btn" href="/">Cancel</Link>
          </div>

          {txStatus ? <div className="muted">{txStatus}</div> : null}
          <TxStatus phase={txPhase} hash={txHash} chainId={Number(runtime?.deployment?.chainId ?? NaN)} error={state.submitError} />
          {state.submitError ? <div className="pre">{state.submitError}</div> : null}
        </section>
      ) : null}
    </div>
  );
}
