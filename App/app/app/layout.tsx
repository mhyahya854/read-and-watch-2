import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Read & Watch — Local Library',
  description: 'A private local-first library for books, films, series, notes, and media.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
