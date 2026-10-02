import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { Nav } from '@/components/nav';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={manrope.variable}>
      <body>
        <QueryProvider>
          <Nav />
          <main className="p-4">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
