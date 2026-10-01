'use client';

import { use } from 'react';
import { HurtokDetailPanel } from '@/components/hurtok-detail-panel';

export default function HurtokMembersPage({ params }: { params: Promise<{ kurinNumber: string; slug: string }> }) {
  const { slug } = use(params);
  return <HurtokDetailPanel slug={slug} />;
}
