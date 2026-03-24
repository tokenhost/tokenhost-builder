import { Suspense } from 'react';

import MicroblogPostRouteClient from '../../src/components/MicroblogPostRouteClient';

export default function PostPage() {
  return (
    <Suspense fallback={null}>
      <MicroblogPostRouteClient />
    </Suspense>
  );
}
