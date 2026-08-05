'use client';

import { TopBar } from '@/components/topbar/TopBar';
import { QuickCaptureInput } from '@/components/capture/QuickCaptureInput';
import { AgenticAssistPanel } from '@/components/assist';
import { CockpitBackdrop, BootSequence } from '@/components/visual';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `relative` + `isolate` establish the stacking context the backdrop sits
    // behind. Without isolate, the -z-10 layer escapes and paints over the page
    // background instead of under the cockpit.
    <div className="relative isolate flex min-h-screen flex-col">
      <BootSequence />
      <CockpitBackdrop className="-z-10" />

      {/* Top Bar - Always visible */}
      <TopBar />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Agentic Assist - right slide-in overlay, toggled from TopBar */}
      <AgenticAssistPanel variant="overlay" />

      {/* Quick Capture - Fixed at bottom */}
      <QuickCaptureInput />
    </div>
  );
}
