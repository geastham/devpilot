import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-base': '#0F1F3D',
        'bg-panel': '#060F1E',
        'bg-surface': '#1A2E4A',

        // Zone colors (for card backgrounds/tints)
        'zone-ready': '#FFFFFF',
        'zone-refining': '#DBEAFE',
        'zone-shaping': '#EDE9FE',
        'zone-directional': '#F3F4F6',

        // Accent colors
        'accent-primary': '#3B82F6',
        'accent-amber': '#F59E0B',
        'accent-red': '#EF4444',
        'accent-green': '#10B981',
        'accent-purple': '#8B5CF6',

        // Model colors
        'model-haiku': '#10B981',
        'model-sonnet': '#3B82F6',
        'model-opus': '#8B5CF6',

        // Text colors
        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-muted': '#475569',

        // Borders
        'border-default': 'rgba(255, 255, 255, 0.08)',
        'border-amber': 'rgba(245, 158, 11, 0.6)',
        'border-red': 'rgba(239, 68, 68, 0.6)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '16px' }],
        'sm': ['12px', { lineHeight: '16px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['32px', { lineHeight: '40px' }],
        '4xl': ['48px', { lineHeight: '56px' }],
      },
      borderRadius: {
        'DEFAULT': '8px',
        'lg': '12px',
        'xl': '16px',
        'full': '9999px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 4px 16px rgba(0, 0, 0, 0.4)',
        'panel': '0 4px 24px rgba(0, 0, 0, 0.5)',
        'glow-amber': '0 0 12px rgba(245, 158, 11, 0.4)',
        'glow-red': '0 0 12px rgba(239, 68, 68, 0.4)',
        'glow-purple': '0 0 12px rgba(139, 92, 246, 0.3)',
      },
      animation: {
        'item-launch': 'itemLaunch 300ms ease-out forwards',
        'border-pulse': 'borderPulse 2s ease-in-out infinite',
        'border-pulse-fast': 'borderPulse 1s ease-in-out infinite',
        'slide-in-top': 'slideInFromTop 200ms ease-out',
        'slide-in-right': 'slideInFromRight 200ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 500ms ease-out forwards',
        'pop': 'pop 200ms ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        itemLaunch: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '60%': { transform: 'translateY(-40px)', opacity: '0.6' },
          '100%': { transform: 'translateY(-60px)', opacity: '0' },
        },
        borderPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--pulse-color, rgba(245, 158, 11, 0.4))' },
          '50%': { boxShadow: '0 0 0 4px var(--pulse-color, rgba(245, 158, 11, 0.4))' },
        },
        slideInFromTop: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideInFromRight: {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeOut: {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        pop: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.2)', opacity: '0.8' },
        },
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};

export default config;
