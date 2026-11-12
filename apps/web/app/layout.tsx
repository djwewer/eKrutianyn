import type { Metadata } from 'next';
import { Oswald, PT_Sans, PT_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { AppShell } from '@/components/app-shell';
import { cn } from '@/lib/utils';

const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
});
const ptSans = PT_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-pt-sans',
  display: 'swap',
});
const ptMono = PT_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: '400',
  variable: '--font-pt-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'єПластун',
  description: 'Облік проб та структури куреня',
  manifest: '/manifest.json',
};

// Always rendered. Mirrors the system color scheme before hydration (no flash)
// and keeps following system changes, unless the `theme` cookie is light/dark.
// The cookie is checked at run/event time, so choosing «Як у системі» later on
// a light/dark page load works without a reload.
const THEME_PREFERENCE_SCRIPT = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var r=document.documentElement;var f=function(){return /(?:^|; )theme=(light|dark)/.test(document.cookie)};if(!f())r.classList.toggle('dark',m.matches);m.addEventListener('change',function(e){if(f())return;r.classList.toggle('dark',e.matches);});}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value;

  return (
    <html
      lang="uk"
      className={cn(oswald.variable, ptSans.variable, ptMono.variable, theme === 'dark' && 'dark')}
      // For a system-dark visitor with `theme=system` (or no cookie), the inline
      // script below adds the `dark` class before React hydrates, which
      // makes the server-rendered className intentionally not match the
      // real DOM at hydration time. That's expected, not a bug — without
      // this, React logs a hydration-mismatch warning for a difference we
      // already know about and already handle correctly.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_PREFERENCE_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
