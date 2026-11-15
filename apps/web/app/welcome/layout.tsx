import type { Metadata } from 'next';

// The invite token is in the URL, so never leak it through the Referer header.
export const metadata: Metadata = { referrer: 'no-referrer' };

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
