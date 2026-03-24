'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { resolveReferenceRecords } from '../lib/relations';
import { listHashtagRecords, loadAppRuntime } from '../lib/runtime';
import PostStream, { sortFeedItemsDesc } from './PostStream';
import type { FeedItem } from './PostStream';

type TagState = {
  hashtag: string;
  items: FeedItem[];
  loading: boolean;
  error: string | null;
};

export default function MicroblogTagClient() {
  const searchParams = useSearchParams();
  const tag = String(searchParams.get('value') ?? '').trim();
  const [state, setState] = useState<TagState>({ hashtag: '', items: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tag) {
        setState({ hashtag: '', items: [], loading: false, error: null });
        return;
      }

      try {
        const runtime = await loadAppRuntime();
        const page = await listHashtagRecords({
          manifest: runtime.manifest,
          publicClient: runtime.publicClient,
          abi: runtime.abi,
          address: runtime.appAddress,
          collectionName: 'Post',
          fieldName: 'body',
          hashtag: tag,
          pageSize: 25
        });

        if (cancelled) return;

        const resolved = await resolveReferenceRecords(runtime, page.ids.map((id, index) => ({ id, record: page.records[index] })), {
          fieldName: 'authorProfile',
          targetCollectionName: 'Profile'
        });
        if (cancelled) return;

        const items = sortFeedItemsDesc(
          resolved.map((item) => ({
            id: item.id,
            record: item.record,
            authorProfileId: item.referenceId,
            authorProfile: item.referenceRecord
          }))
        );
        setState({ hashtag: page.hashtag, items, loading: false, error: null });
      } catch (error: any) {
        if (cancelled) return;
        setState({ hashtag: '', items: [], loading: false, error: String(error?.message ?? error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div className="pageStack">
      <section className="card heroPanel">
        <div className="heroSplit">
          <div>
            <div className="heroTopline">
              <span className="eyebrow">/tag/query</span>
              <div className="chipRow">
                <span className="badge">{state.hashtag ? `#${state.hashtag}` : 'no tag selected'}</span>
                <span className="badge">tokenized index read</span>
              </div>
            </div>
            <h2 className="displayTitle">
              {state.hashtag ? `#${state.hashtag}` : 'Hashtag feed'}
              <br />
              <span>resolved from the native on-chain index.</span>
            </h2>
            <p className="lead">
              Token Host queries the generated <span className="badge">listByIndexPost_body</span> accessor, then filters current records
              against live post content and resolves each post&apos;s current author profile at render time.
            </p>
            <div className="actionGroup">
              <Link className="btn primary" href="/Post/?mode=new">Compose tagged post</Link>
              <Link className="btn" href="/">Back to feed</Link>
            </div>
          </div>

          <div className="heroDataPanel">
            <div className="eyebrow">/result</div>
            <div className="heroStatGrid">
              <div className="heroStat">
                <div className="heroStatValue">{state.loading ? '…' : state.items.length}</div>
                <div className="heroStatLabel">Matches</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{state.hashtag ? `#${state.hashtag}` : '—'}</div>
                <div className="heroStatLabel">Token</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!tag ? (
        <section className="card">
          <div className="eyebrow">/tag/missing</div>
          <h3>No hashtag selected</h3>
          <p className="muted">Open a tag from the home feed or visit a route like <span className="badge">/tag?value=tokenhost</span>.</p>
        </section>
      ) : null}

      {state.error ? (
        <section className="card">
          <div className="eyebrow">/tag/error</div>
          <h3>Unable to load hashtag feed</h3>
          <p className="muted">{state.error}</p>
        </section>
      ) : null}

      {tag && !state.loading && !state.error ? (
        <PostStream
          items={state.items}
          emptyTitle={`No posts found for #${state.hashtag || tag}`}
          emptyBody="Create a post with that hashtag and reload the feed."
        />
      ) : null}

      {tag && state.loading ? (
        <section className="card">
          <div className="eyebrow">/tag/loading</div>
          <p className="muted">Loading hashtag feed…</p>
        </section>
      ) : null}
    </div>
  );
}
