'use client';

import Link from 'next/link';

import { formatDateTime } from '../lib/format';
import { extractHashtagTokens } from '../lib/indexing';
import { feedCardSummary, type GeneratedFeedConfig, type GeneratedFeedItem } from '../lib/generated-ui';

export default function GeneratedFeedStream(props: {
  feed: GeneratedFeedConfig;
  items: GeneratedFeedItem[];
  emptyTitle: string;
  emptyBody: string;
  tokenPageId?: string;
}) {
  const textField = props.feed.card?.textField ?? 'body';
  const tagBaseHref = props.tokenPageId
    ? `/tag?page=${encodeURIComponent(props.tokenPageId)}&value=`
    : '/tag?value=';

  if (!props.items.length) {
    return (
      <section className="card">
        <div className="eyebrow">/feed/empty</div>
        <h3>{props.emptyTitle}</h3>
        <p className="muted">{props.emptyBody}</p>
      </section>
    );
  }

  return (
    <div className="grid">
      {props.items.map((item) => {
        const summary = feedCardSummary(item, props.feed);
        const tags = extractHashtagTokens(summary.body);
        const timestamp = item.record?.updatedAt ?? item.record?.createdAt ?? null;
        return (
          <article key={String(item.id)} className="card half" style={{ display: 'grid', gap: 14 }}>
            <div className="collectionCardHeader" style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="eyebrow">/{props.feed.collection.toLowerCase()}/{String(item.id)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {summary.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={summary.imageUrl}
                      alt={summary.title}
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--border)' }}
                    />
                  ) : null}
                  <div>
                    <h3 style={{ margin: 0 }}>{summary.title}</h3>
                    {summary.subtitle ? <p className="muted" style={{ margin: 0 }}>{summary.subtitle}</p> : null}
                  </div>
                </div>
                <p className="muted" style={{ margin: 0 }}>{timestamp ? formatDateTime(timestamp, 'compact') : 'On-chain record'}</p>
              </div>
              <div className="chipRow">
                <span className="badge">{summary.mediaUrl ? 'image post' : 'text post'}</span>
                <span className="badge">id {String(item.id)}</span>
                {item.referenceId ? <span className="badge">profile {String(item.referenceId)}</span> : null}
              </div>
            </div>

            {summary.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{summary.body}</p> : null}

            {summary.mediaUrl ? (
              <div style={{ overflow: 'hidden', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <img src={summary.mediaUrl} alt={`${props.feed.collection} ${String(item.id)}`} style={{ display: 'block', width: '100%', maxHeight: 460, objectFit: 'cover' }} />
              </div>
            ) : null}

            {tags.length ? (
              <div className="chipRow">
                {tags.map((tag) => (
                  <Link key={`${String(item.id)}-${tag}`} className="badge" href={`${tagBaseHref}${encodeURIComponent(tag)}`}>
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
