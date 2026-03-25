'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import GeneratedFeedStream from './GeneratedFeedStream';
import {
  collectGeneratedTrendingTokens,
  generatedHomeSections,
  getGeneratedFeed,
  getGeneratedTokenPage,
  loadGeneratedFeed,
  loadGeneratedUiRuntime,
  sortGeneratedFeedItemsDesc,
  type GeneratedFeedItem
} from '../lib/generated-ui';
import { ths } from '../lib/ths';

export default function GeneratedHomePageClient() {
  const sections = generatedHomeSections();
  const tokenListSection = useMemo(
    () => sections.find((candidate) => candidate.type === 'tokenList'),
    [sections]
  );
  const [feeds, setFeeds] = useState<Record<string, GeneratedFeedItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const runtime = await loadGeneratedUiRuntime();
        const nextFeeds: Record<string, GeneratedFeedItem[]> = {};
        for (const section of sections) {
          if (section.type !== 'feed') continue;
          const feed = getGeneratedFeed(section.feed);
          if (!feed) continue;
          nextFeeds[feed.id] = sortGeneratedFeedItemsDesc(await loadGeneratedFeed(runtime, feed));
        }
        if (cancelled) return;
        setFeeds(nextFeeds);
        setLoading(false);
      } catch (cause: any) {
        if (cancelled) return;
        setError(String(cause?.message ?? cause));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sections]);

  const collectionCount = ths.collections.length;

  return (
    <div className="pageStack">
      {sections.map((section, index) => {
        if (section.type === 'hero') {
          return (
            <section key={`hero-${index}`} className="card heroPanel">
              <div className="heroSplit">
                <div>
                  <div className="heroTopline">
                    <span className="eyebrow">{section.eyebrow || '/generated/hero'}</span>
                    <div className="chipRow">
                      {(section.badges ?? []).map((badge) => (
                        <span key={badge} className="badge">{badge}</span>
                      ))}
                    </div>
                  </div>
                  <h2 className="displayTitle displayTitleHero">
                    {section.title}
                    {section.accent ? (
                      <>
                        <br />
                        <span>{section.accent}</span>
                      </>
                    ) : null}
                  </h2>
                  {section.description ? <p className="lead">{section.description}</p> : null}
                  <div className="actionGroup">
                    {(section.actions ?? []).map((action) => (
                      <Link key={`${action.label}-${action.href}`} className={action.variant === 'primary' ? 'btn primary' : 'btn'} href={action.href}>
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="heroDataPanel">
                  <div className="eyebrow">/generated/summary</div>
                  <div className="heroStatGrid">
                    <div className="heroStat">
                      <div className="heroStatValue">{loading ? '…' : Object.values(feeds).reduce((sum, items) => sum + items.length, 0)}</div>
                      <div className="heroStatLabel">Feed items</div>
                    </div>
                    <div className="heroStat">
                      <div className="heroStatValue">{collectionCount}</div>
                      <div className="heroStatLabel">Collections</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (section.type === 'tokenList') {
          const tokenPage = getGeneratedTokenPage(section.tokenPage);
          const feed = tokenPage?.feed ? getGeneratedFeed(tokenPage.feed) : null;
          const feedItems = feed ? feeds[feed.id] ?? [] : [];
          const trending = tokenPage && feed ? collectGeneratedTrendingTokens(feedItems, tokenPage.field, 10) : [];
          return (
            <section key={`token-${index}`} className="card">
              <div className="sectionHeading">
                <div className="sectionHeadingPrimary">
                  <span className="eyebrow">/generated/tokens</span>
                  <h2>{section.title}</h2>
                </div>
              </div>
              <div className="chipRow">
                {trending.length ? trending.map((entry) => (
                  <Link key={entry.token} className="badge" href={`/tag?page=${encodeURIComponent(section.tokenPage)}&value=${encodeURIComponent(entry.token)}`}>
                    #{entry.token} · {entry.count}
                  </Link>
                )) : <span className="muted">{section.emptyBody || 'No indexed tokens yet.'}</span>}
              </div>
            </section>
          );
        }

        const feed = getGeneratedFeed(section.feed);
        if (!feed) return null;
        return (
          <section key={`feed-${index}`} className="pageStack">
            <section className="card sectionHeading">
              <div className="sectionHeadingPrimary">
                <span className="eyebrow">/generated/feed</span>
                <h2>{section.title}</h2>
              </div>
            </section>
            {loading ? (
              <section className="card">
                <div className="eyebrow">/feed/loading</div>
                <p className="muted">Loading feed…</p>
              </section>
            ) : error ? (
              <section className="card">
                <div className="eyebrow">/feed/error</div>
                <p className="muted">{error}</p>
              </section>
            ) : (
              <GeneratedFeedStream
                feed={feed}
                items={feeds[feed.id] ?? []}
                emptyTitle={section.emptyTitle || 'No records yet'}
                emptyBody={section.emptyBody || 'Create the first record to populate this feed.'}
                tokenPageId={tokenListSection?.type === 'tokenList' ? tokenListSection.tokenPage : undefined}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
