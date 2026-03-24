'use client';

import Link from 'next/link';

import { formatDateTime } from '../lib/format';
import { extractHashtagTokens } from '../lib/indexing';
import { profileDisplayName, profileHandle, type FeedItem } from '../lib/microblog';

export function sortFeedItemsDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

export function collectTrendingTags(items: FeedItem[], limit = 8): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of extractHashtagTokens(String(item.record?.body ?? ''))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function PostCard({ item }: { item: FeedItem }) {
  const body = String(item.record?.body ?? '').trim();
  const image = String(item.record?.image ?? '').trim();
  const authorHandle = profileHandle(item.authorProfile);
  const authorName = profileDisplayName(item.authorProfile);
  const avatar = String(item.authorProfile?.avatar ?? '').trim();
  const tags = extractHashtagTokens(body);
  const timestamp = item.record?.updatedAt ?? item.record?.createdAt ?? null;

  return (
    <article className="card half" style={{ display: 'grid', gap: 14 }}>
      <div className="collectionCardHeader" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="eyebrow">/post/{String(item.id)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={authorName}
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--th-border)' }}
              />
            ) : null}
            <div>
              <h3 style={{ margin: 0 }}>{authorName}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {authorHandle ? `@${authorHandle}` : 'Unresolved profile'}
              </p>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {timestamp ? formatDateTime(timestamp, 'compact') : 'On-chain post'}
          </p>
        </div>
        <div className="chipRow">
          <span className="badge">{image ? 'image post' : 'text post'}</span>
          <span className="badge">id {String(item.id)}</span>
          {item.authorProfileId ? <span className="badge">profile {String(item.authorProfileId)}</span> : null}
        </div>
      </div>

      {body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{body}</p> : null}

      {image ? (
        <div
          style={{
            overflow: 'hidden',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)'
          }}
        >
          <img
            src={image}
            alt={`Post ${String(item.id)}`}
            style={{ display: 'block', width: '100%', maxHeight: 460, objectFit: 'cover' }}
          />
        </div>
      ) : null}

      {tags.length ? (
        <div className="chipRow">
          {tags.map((tag) => (
            <Link key={`${String(item.id)}-${tag}`} className="badge" href={`/tag?value=${encodeURIComponent(tag)}`}>
              #{tag}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function PostStream(props: { items: FeedItem[]; emptyTitle: string; emptyBody: string }) {
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
      {props.items.map((item) => (
        <PostCard key={String(item.id)} item={item} />
      ))}
    </div>
  );
}
