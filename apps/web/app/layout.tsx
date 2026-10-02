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
    <html lang="uk" className={cn(manrope.variable, theme === 'dark' && 'dark')}>
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
