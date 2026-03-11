import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevPilot Conductor',
  description: 'Manage your AI coding agent fleet',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
