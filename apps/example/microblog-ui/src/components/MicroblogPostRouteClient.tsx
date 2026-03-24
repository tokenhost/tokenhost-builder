'use client';

import { useSearchParams } from 'next/navigation';

import CollectionPage from '../collection-route/CollectionPage';
import MicroblogComposeClient from './MicroblogComposeClient';

export default function MicroblogPostRouteClient() {
  const searchParams = useSearchParams();
  const mode = String(searchParams.get('mode') ?? '').trim();

  if (mode === 'new') {
    return <MicroblogComposeClient />;
  }

  return <CollectionPage collectionName="Post" />;
}
