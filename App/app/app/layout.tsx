import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { DesktopOpenCoordinator } from '@/components/desktop/desktop-open-coordinator';

export const metadata: Metadata = {
  title: 'Read & Watch | Local Library',
  description: 'A private local-first library for books, films, series, notes, and media.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <DesktopOpenCoordinator />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
