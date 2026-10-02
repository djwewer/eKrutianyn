import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { Nav } from '@/components/nav';
import { cn } from '@/lib/utils';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'єПластун',
  description: 'Облік проб та структури куреня',
  manifest: '/manifest.json',
};

// Runs before hydration, only when no `theme` cookie exists yet (first-time
// visitor). Mirrors the system color scheme so there's no flash of the
// wrong theme before ThemeToggle's own useLayoutEffect sync takes over.
const THEME_PREFERENCE_SCRIPT = `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value;

  return (
    <html
      lang="uk"
      className={cn(manrope.variable, theme === 'dark' && 'dark')}
      // For a system-dark visitor with no `theme` cookie yet, the inline
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
          <Nav />
          <main className="p-4">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
