/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── Kapio Brand (teal accent — conservé et affiné) ─────────────
        kapio: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          200: '#5ECFAE',
          300: '#2EB88A',
          400: '#1FA872',
          500: '#1D9E75',
          600: '#0F6E56',
          700: '#085041',
          800: '#063C30',
          900: '#04342C',
          950: '#021F1A',
        },
        // Alias pour compat avec l'ancien code (teal-XXX continue de marcher)
        teal: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          200: '#5ECFAE',
          300: '#2EB88A',
          400: '#1FA872',
          500: '#1D9E75',
          600: '#0F6E56',
          700: '#085041',
          800: '#063C30',
          900: '#04342C',
          950: '#021F1A',
        },
        // ─── Dark surfaces (Linear / Vercel inspired) ──────────────────
        ink: {
          950: '#070708',   // background absolu
          900: '#0A0A0B',   // background principal
          850: '#0F0F11',   // surface niveau 0
          800: '#111113',   // surface niveau 1 (cards)
          750: '#151517',   // surface niveau 1.5
          700: '#18181B',   // surface niveau 2 (modals, popovers)
          600: '#1F1F23',   // surface niveau 3 (élévation max)
          500: '#27272A',   // border subtle
          400: '#3F3F46',   // border emphasis / hover
          300: '#52525B',   // disabled / muted
          200: '#71717A',   // text muted
          100: '#A1A1AA',   // text secondary
          50:  '#D4D4D8',   // text tertiary
          0:   '#FAFAFA',   // text primary
        },
        // ─── Sémantique (gains/pertes/alertes) ─────────────────────────
        success: {
          400: '#34D399',
          500: '#22C55E',
          600: '#16A34A',
        },
        warning: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        danger: {
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'display-sm': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display':    ['3rem',    { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display-lg': ['4rem',    { lineHeight: '1.0', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-xl': ['5.5rem',  { lineHeight: '0.95', letterSpacing: '-0.035em', fontWeight: '800' }],
      },
      keyframes: {
        // ─── Animations CSS de fallback (Framer prend le relais ailleurs) ──
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(7px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'   },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'    },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)'   },
          '50%':      { transform: 'translateY(-22px)' },
        },
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)'  },
        },
        glow: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)'    },
          '50%':      { opacity: '0.7',  transform: 'scale(1.08)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1'   },
          '50%':      { opacity: '0.4' },
        },
        auroraShift: {
          '0%, 100%': { transform: 'translate(0%, 0%) rotate(0deg)' },
          '33%':      { transform: 'translate(8%, -6%) rotate(2deg)' },
          '66%':      { transform: 'translate(-6%, 4%) rotate(-1deg)' },
        },
        gridFade: {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.7' },
        },
        beam: {
          '0%':   { transform: 'translateX(-100%) skewX(-12deg)', opacity: '0' },
          '50%':  { opacity: '1' },
          '100%': { transform: 'translateX(200%) skewX(-12deg)',  opacity: '0' },
        },
      },
      animation: {
        'fade-in':      'fadeIn 0.18s ease-out both',
        'slide-up':     'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) both',
        'slide-up-d1':  'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.08s both',
        'slide-up-d2':  'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.16s both',
        'slide-up-d3':  'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.24s both',
        'float':        'float 7s ease-in-out infinite',
        'float-slow':   'float 11s ease-in-out infinite 1.5s',
        'shimmer':      'shimmer 2.4s ease-in-out infinite',
        'glow':         'glow 5s ease-in-out infinite',
        'glow-delay':   'glow 5s ease-in-out infinite 2.2s',
        'pulse2':       'pulse2 2.4s ease-in-out infinite',
        'aurora':       'auroraShift 18s ease-in-out infinite',
        'grid-fade':    'gridFade 4s ease-in-out infinite',
        'beam':         'beam 3s ease-in-out infinite',
      },
      boxShadow: {
        // Anciennes ombres (compat)
        'glass':       '0 8px 32px rgba(15, 110, 86, 0.12), 0 1px 0 rgba(255,255,255,0.8) inset',
        'hero':        '0 32px 80px rgba(4, 52, 44, 0.35)',
        'card-hover':  '0 20px 48px rgba(15, 110, 86, 0.15)',
        // Nouvelles ombres dark
        'card-dark':   '0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.35)',
        'card-dark-hover': '0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(46,184,138,0.25), 0 20px 48px rgba(0,0,0,0.5), 0 0 32px rgba(46,184,138,0.08)',
        'glow-kapio':  '0 0 40px rgba(46, 184, 138, 0.35), 0 0 80px rgba(46, 184, 138, 0.15)',
        'glow-soft':   '0 0 24px rgba(46, 184, 138, 0.2)',
        'inner-dark':  'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.04)',
        'cta-dark':    '0 0 0 1px rgba(46,184,138,0.5), 0 0 32px rgba(46,184,138,0.4), 0 12px 32px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        // Anciens gradients (compat)
        'hero-gradient':    'linear-gradient(135deg, #021F1A 0%, #04342C 40%, #063C30 70%, #021F1A 100%)',
        'teal-gradient':    'linear-gradient(135deg, #0F6E56, #1D9E75)',
        'card-gradient':    'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(225,245,238,0.4))',
        // Nouveaux dark
        'kapio-gradient':   'linear-gradient(135deg, #1D9E75 0%, #2EB88A 50%, #34D399 100%)',
        'kapio-radial':     'radial-gradient(circle at 50% 50%, rgba(46,184,138,0.18) 0%, rgba(46,184,138,0) 70%)',
        'ink-gradient':     'linear-gradient(180deg, #0A0A0B 0%, #070708 100%)',
        'card-dark':        'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        'aurora':           'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(46,184,138,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 20% 100%, rgba(29,158,117,0.1) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(52,211,153,0.08) 0%, transparent 50%)',
        'grid-dark':        'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'dot-grid':         'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid':     '32px 32px',
        'grid-lg':  '64px 64px',
        'dot':      '24px 24px',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        'kapio': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
      },
    },
  },
  plugins: [],
};