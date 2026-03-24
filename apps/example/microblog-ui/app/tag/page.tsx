import { Suspense } from 'react';

import MicroblogTagClient from '../../src/components/MicroblogTagClient';

export default function TagPage() {
  return (
    <Suspense fallback={null}>
      <MicroblogTagClient />
    </Suspense>
  );
}
