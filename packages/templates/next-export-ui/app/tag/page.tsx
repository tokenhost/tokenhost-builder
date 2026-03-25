import { Suspense } from 'react';

import GeneratedTokenPageClient from '../../src/components/GeneratedTokenPageClient';

export default function TagPage() {
  return (
    <Suspense fallback={null}>
      <GeneratedTokenPageClient />
    </Suspense>
  );
}
