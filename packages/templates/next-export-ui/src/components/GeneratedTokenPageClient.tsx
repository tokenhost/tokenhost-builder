'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import GeneratedFeedStream from './GeneratedFeedStream';
import {
  generatedTokenPages,
  getGeneratedFeed,
  getGeneratedTokenPage,
  loadGeneratedTokenFeed,
  loadGeneratedUiRuntime,
  sortGeneratedFeedItemsDesc,
  type GeneratedFeedItem
} from '../lib/generated-ui';

type TokenState = {
  token: string;
  items: GeneratedFeedItem[];
  loading: boolean;
  error: string | null;
};

export default function GeneratedTokenPageClient() {
  const searchParams = useSearchParams();
  const pageId = String(searchParams.get('page') ?? '').trim();
  const value = String(searchParams.get('value') ?? '').trim();
  const tokenPage = getGeneratedTokenPage(pageId || generatedTokenPages()[0]?.id || '');
  const feed = tokenPage?.feed ? getGeneratedFeed(tokenPage.feed) : null;
  const [state, setState] = useState<TokenState>({ token: '', items: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!tokenPage || !value) {
        setState({ token: '', items: [], loading: false, error: null });
        return;
      }
      try {
        const runtime = await loadGeneratedUiRuntime();
        const result = await loadGeneratedTokenFeed(runtime, tokenPage, value);
        if (cancelled) return;
        setState({ token: result.token, items: sortGeneratedFeedItemsDesc(result.items), loading: false, error: null });
      } catch (cause: any) {
        if (cancelled) return;
        setState({ token: '', items: [], loading: false, error: String(cause?.message ?? cause) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenPage, value]);

  return (
    <div className="pageStack">
      <section className="card heroPanel">
        <div className="heroSplit">
          <div>
            <div className="heroTopline">
              <span className="eyebrow">/generated/token-page</span>
              <div className="chipRow">
                <span className="badge">{state.token ? `#${state.token}` : 'no token selected'}</span>
                <span className="badge">tokenized index read</span>
              </div>
            </div>
            <h2 className="displayTitle">
              {tokenPage?.title || 'Token feed'}
              <br />
              <span>{state.token ? `#${state.token}` : 'resolved from generated config'}</span>
            </h2>
            <div className="actionGroup">
              <Link className="btn" href="/">Back to home</Link>
              <Link className="btn primary" href={`/${feed?.collection || 'Post'}/?mode=new`}>Create record</Link>
            </div>
          </div>
        </div>
      </section>

      {!value ? (
        <section className="card">
          <div className="eyebrow">/token/missing</div>
          <h3>No token selected</h3>
          <p className="muted">Open a generated token link or use a route like <span className="badge">/tag?page={pageId || tokenPage?.id || 'hashtags'}&value=tokenhost</span>.</p>
        </section>
      ) : state.loading ? (
        <section className="card">
          <div className="eyebrow">/token/loading</div>
          <p className="muted">Loading token feed…</p>
        </section>
      ) : state.error ? (
        <section className="card">
          <div className="eyebrow">/token/error</div>
          <p className="muted">{state.error}</p>
        </section>
      ) : feed ? (
        <GeneratedFeedStream
          feed={feed}
          items={state.items}
          emptyTitle={tokenPage?.emptyTitle || `No records found for #${state.token || value}`}
          emptyBody={tokenPage?.emptyBody || 'Create a record with that token and reload the feed.'}
          tokenPageId={tokenPage?.id}
        />
      ) : null}
    </div>
  );
}
