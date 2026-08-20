/**
 * The cockpit's palette, as a Tailwind preset.
 *
 * These components are written against named tokens — `text-text-primary`,
 * `bg-bg-panel`, `border-border-default` — not raw Tailwind colours. That is
 * what lets the same markup be the cockpit in two applications rather than two
 * implementations that drift.
 *
 * The hosted plane is built on `slate-*` and has no idea what `bg-panel` means,
 * so shipping the components without their palette would render them as
 * unstyled boxes. Consumers add this preset:
 *
 *   // tailwind.config.ts
 *   presets: [require('@devpilot.sh/cockpit-ui/theme')]
 *
 * Kept deliberately narrow: only the tokens the shared components actually
 * reference. Adding the cockpit's full theme here would make every consumer
 * inherit type scales and spacing they did not ask for.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        'bg-base': '#0F1F3D',
        'bg-panel': '#060F1E',
        'bg-surface': '#1A2E4A',

        'accent-primary': '#3B82F6',
        'accent-amber': '#F59E0B',
        'accent-red': '#EF4444',
        'accent-green': '#10B981',
        'accent-purple': '#8B5CF6',

        'model-haiku': '#10B981',
        'model-sonnet': '#3B82F6',
        'model-opus': '#8B5CF6',

        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-tertiary': '#64748B',
        'text-muted': '#475569',

        'border-default': 'rgba(255, 255, 255, 0.08)',
        'border-amber': 'rgba(245, 158, 11, 0.6)',
        'border-red': 'rgba(239, 68, 68, 0.6)',
      },
    },
  },
};
