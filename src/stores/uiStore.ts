import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { LayoutVariant, AssistSuggestion } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface UIState {
  // Layout
  layoutVariant: LayoutVariant;
  setLayoutVariant: (variant: LayoutVariant) => void;

  // Panels
  isAssistPanelOpen: boolean;
  isFleetPanelOpen: boolean;
  isConfidencePanelOpen: boolean;
  confidencePanelItemId: string | null;
  isDiffViewOpen: boolean;
  diffViewItemId: string | null;

  // Panel actions
  toggleAssistPanel: () => void;
  toggleFleetPanel: () => void;
  openConfidencePanel: (itemId: string) => void;
  closeConfidencePanel: () => void;
  openDiffView: (itemId: string) => void;
  closeDiffView: () => void;

  // Quick Capture
  quickCaptureValue: string;
  quickCaptureZone: 'DIRECTIONAL' | 'SHAPING' | 'REFINING';
  setQuickCaptureValue: (value: string) => void;
  setQuickCaptureZone: (zone: 'DIRECTIONAL' | 'SHAPING' | 'REFINING') => void;
  cycleQuickCaptureZone: () => void;

  // Command Palette
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Floating HUD
  hudState: 'minimized' | 'quick-add' | 'expanded';
  setHudState: (state: 'minimized' | 'quick-add' | 'expanded') => void;

  // Assist suggestions (for inline display)
  assistSuggestions: AssistSuggestion[];
  inlineResponse: string | null;
  inlineResponseChips: { label: string; type: 'ticket' | 'repo' | 'keyword' }[];
  addAssistSuggestion: (suggestion: AssistSuggestion) => void;
  removeAssistSuggestion: (id: string) => void;
  setInlineResponse: (
    message: string | null,
    chips?: { label: string; type: 'ticket' | 'repo' | 'keyword' }[]
  ) => void;
  clearInlineResponse: () => void;

  // Quiet mode
  isQuietMode: boolean;
  toggleQuietMode: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        // Layout
        layoutVariant: 'gradient-strip',
        setLayoutVariant: (variant) => set({ layoutVariant: variant }),

        // Panels
        isAssistPanelOpen: false,
        isFleetPanelOpen: false,
        isConfidencePanelOpen: false,
        confidencePanelItemId: null,
        isDiffViewOpen: false,
        diffViewItemId: null,

        // Panel actions
        toggleAssistPanel: () =>
          set((state) => ({ isAssistPanelOpen: !state.isAssistPanelOpen })),

        toggleFleetPanel: () =>
          set((state) => ({ isFleetPanelOpen: !state.isFleetPanelOpen })),

        openConfidencePanel: (itemId) =>
          set({
            isConfidencePanelOpen: true,
            confidencePanelItemId: itemId,
          }),

        closeConfidencePanel: () =>
          set({
            isConfidencePanelOpen: false,
            confidencePanelItemId: null,
          }),

        openDiffView: (itemId) =>
          set({
            isDiffViewOpen: true,
            diffViewItemId: itemId,
          }),

        closeDiffView: () =>
          set({
            isDiffViewOpen: false,
            diffViewItemId: null,
          }),

        // Quick Capture
        quickCaptureValue: '',
        quickCaptureZone: 'DIRECTIONAL',
        setQuickCaptureValue: (value) => set({ quickCaptureValue: value }),
        setQuickCaptureZone: (zone) => set({ quickCaptureZone: zone }),
        cycleQuickCaptureZone: () =>
          set((state) => {
            const zones = ['DIRECTIONAL', 'SHAPING', 'REFINING'] as const;
            const currentIndex = zones.indexOf(state.quickCaptureZone);
            const nextIndex = (currentIndex + 1) % zones.length;
            return { quickCaptureZone: zones[nextIndex] };
          }),

        // Command Palette
        isCommandPaletteOpen: false,
        openCommandPalette: () => set({ isCommandPaletteOpen: true }),
        closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
        toggleCommandPalette: () =>
          set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),

        // Floating HUD
        hudState: 'minimized',
        setHudState: (state) => set({ hudState: state }),

        // Assist suggestions
        assistSuggestions: [],
        inlineResponse: null,
        inlineResponseChips: [],

        addAssistSuggestion: (suggestion) =>
          set((state) => ({
            assistSuggestions: [suggestion, ...state.assistSuggestions].slice(
              0,
              20
            ),
          })),

        removeAssistSuggestion: (id) =>
          set((state) => ({
            assistSuggestions: state.assistSuggestions.filter(
              (s) => s.id !== id
            ),
          })),

        setInlineResponse: (message, chips = []) =>
          set({
            inlineResponse: message,
            inlineResponseChips: chips,
          }),

        clearInlineResponse: () =>
          set({
            inlineResponse: null,
            inlineResponseChips: [],
          }),

        // Quiet mode
        isQuietMode: false,
        toggleQuietMode: () =>
          set((state) => ({ isQuietMode: !state.isQuietMode })),
      }),
      {
        name: 'devpilot-ui',
        partialize: (state) => ({
          layoutVariant: state.layoutVariant,
          isQuietMode: state.isQuietMode,
        }),
      }
    ),
    { name: 'ui-store' }
  )
);

// ============================================================================
// Keyboard shortcuts hook
// ============================================================================

export function useKeyboardShortcuts() {
  const { toggleCommandPalette, cycleQuickCaptureZone } = useUIStore();

  if (typeof window !== 'undefined') {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K: Toggle command palette
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        toggleCommandPalette();
      }

      // Tab in quick capture: cycle zone
      if (
        event.key === 'Tab' &&
        document.activeElement?.id === 'quick-capture-input'
      ) {
        event.preventDefault();
        cycleQuickCaptureZone();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }
}
