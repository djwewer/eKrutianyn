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

// Runs before hydration when the `theme` cookie is `system` or missing. It
// mirrors the system color scheme so there's no flash of the wrong theme, and
// keeps following system changes until the user picks light/dark (the cookie
// is checked at event time, so no reload is needed to stop).
const THEME_PREFERENCE_SCRIPT = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var r=document.documentElement;r.classList.toggle('dark',m.matches);m.addEventListener('change',function(e){if(/(?:^|; )theme=(light|dark)/.test(document.cookie))return;r.classList.toggle('dark',e.matches);});}catch(e){}})();`;

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
        {theme !== 'light' && theme !== 'dark' && (
          <script dangerouslySetInnerHTML={{ __html: THEME_PREFERENCE_SCRIPT }} />
        )}
      </head>
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
