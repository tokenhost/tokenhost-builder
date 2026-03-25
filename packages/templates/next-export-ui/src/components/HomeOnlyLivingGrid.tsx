'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

import LivingGrid from './LivingGrid';

export default function HomeOnlyLivingGrid() {
  const pathname = usePathname();

  if (pathname && pathname !== '/') {
    return null;
  }

  return <LivingGrid />;
}
