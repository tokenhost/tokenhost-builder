'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { resolveFeedItemsWithProfiles, loadMicroblogRuntime, type FeedItem } from '../lib/microblog';
import { listAllRecords } from '../lib/runtime';
import PostStream, { collectTrendingTags, sortFeedItemsDesc } from './PostStream';

type LoadState = {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
};

export default function MicroblogHomeClient() {
  const [state, setState] = useState<LoadState>({ items: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const runtime = await loadMicroblogRuntime();
        const page = await listAllRecords({
          publicClient: runtime.publicClient,
          abi: runtime.abi,
          address: runtime.appAddress,
          collectionName: 'Post',
          pageSize: 25
        });

        if (cancelled) return;

        const resolved = await resolveFeedItemsWithProfiles(
          runtime,
          page.ids.map((id, index) => ({ id, record: page.records[index] }))
        );
        if (cancelled) return;

        const items = sortFeedItemsDesc(resolved).slice(0, 24);
        setState({ items, loading: false, error: null });
      } catch (error: any) {
        if (cancelled) return;
        setState({ items: [], loading: false, error: String(error?.message ?? error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const trending = useMemo(() => collectTrendingTags(state.items, 10), [state.items]);
  const imagePostCount = useMemo(
    () => state.items.filter((item) => String(item.record?.image ?? '').trim()).length,
    [state.items]
  );

  return (
    <div className="pageStack">
      <section className="card heroPanel">
        <div className="heroSplit">
          <div>
            <div className="heroTopline">
              <span className="eyebrow">/tokenhost/microblog</span>
              <div className="chipRow">
                <span className="badge">native hashtags</span>
                <span className="badge">native image uploads</span>
                <span className="badge">filecoin-ready</span>
              </div>
            </div>
            <h2 className="displayTitle">
              Microblog posts
              <br />
              <span>with on-chain discovery and first-class media.</span>
            </h2>
            <p className="lead">
              This example app uses Token Host&apos;s native hashtag index on <span className="badge">Post.body</span> and the native
              upload field flow for <span className="badge">Post.image</span>. Posts reference <span className="badge">Profile</span> records
              instead of copying handles into each post.
            </p>
            <div className="actionGroup">
              <Link className="btn primary" href="/Post/?mode=new">Compose post</Link>
              <Link className="btn" href="/Profile/?mode=new">Create profile</Link>
              <Link className="btn" href="/Post/">Browse raw records</Link>
            </div>
          </div>

          <div className="heroDataPanel">
            <div className="eyebrow">/demo/status</div>
            <div className="heroStatGrid">
              <div className="heroStat">
                <div className="heroStatValue">{state.loading ? '…' : state.items.length}</div>
                <div className="heroStatLabel">Feed posts</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{state.loading ? '…' : imagePostCount}</div>
                <div className="heroStatLabel">Image posts</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{state.loading ? '…' : trending.length}</div>
                <div className="heroStatLabel">Active tags</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">2</div>
                <div className="heroStatLabel">Collections</div>
              </div>
            </div>
            <div className="heroMeta">
              <span className="badge">author profile reference</span>
              <span className="badge">body hashtag tokenizer</span>
            </div>
          </div>
        </div>
      </section>

      {state.error ? (
        <section className="card">
          <div className="eyebrow">/runtime/error</div>
          <h3>Unable to load the live feed</h3>
          <p className="muted">{state.error}</p>
        </section>
      ) : null}

      <section className="card sectionHeading">
        <div className="sectionHeadingPrimary">
          <span className="eyebrow">/tags</span>
          <h2>Trending hashtags</h2>
        </div>
        <div className="sectionHeadingAside">
          <p className="muted">Hashtags come from the native tokenized index on post bodies, not an app-specific join table.</p>
        </div>
      </section>

      <section className="card">
        <div className="chipRow">
          {trending.length ? (
            trending.map((entry) => (
              <Link key={entry.tag} className="badge" href={`/tag?value=${encodeURIComponent(entry.tag)}`}>
                #{entry.tag} · {entry.count}
              </Link>
            ))
          ) : (
            <span className="muted">Create a few posts with hashtags like #tokenhost, #foc, or #microblog to populate the index.</span>
          )}
        </div>
      </section>

      <section className="card sectionHeading">
        <div className="sectionHeadingPrimary">
          <span className="eyebrow">/feed</span>
          <h2>Latest posts</h2>
        </div>
        <div className="sectionHeadingAside">
          <p className="muted">Text-only and image posts render through the same generated `Post` collection.</p>
        </div>
      </section>

      {state.loading ? (
        <section className="card">
          <div className="eyebrow">/feed/loading</div>
          <p className="muted">Loading posts from the current deployment…</p>
        </section>
      ) : (
        <PostStream
          items={state.items}
          emptyTitle="No posts yet"
          emptyBody="Compose the first post, add a hashtag, and optionally attach an image to see the native upload flow."
        />
      )}
    </div>
  );
}
