'use client';

import { TopBar } from '@/components/topbar/TopBar';
import { QuickCaptureInput } from '@/components/capture/QuickCaptureInput';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Bar - Always visible */}
      <TopBar />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Quick Capture - Fixed at bottom */}
      <QuickCaptureInput />
    </div>
  );
}
