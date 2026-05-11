/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      keyframes: {
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
          '50%':      { transform: 'translateY(-22px)'  },
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
      },
      boxShadow: {
        'glass':    '0 8px 32px rgba(15, 110, 86, 0.12), 0 1px 0 rgba(255,255,255,0.8) inset',
        'hero':     '0 32px 80px rgba(4, 52, 44, 0.35)',
        'card-hover': '0 20px 48px rgba(15, 110, 86, 0.15)',
      },
      backgroundImage: {
        'hero-gradient':    'linear-gradient(135deg, #021F1A 0%, #04342C 40%, #063C30 70%, #021F1A 100%)',
        'teal-gradient':    'linear-gradient(135deg, #0F6E56, #1D9E75)',
        'card-gradient':    'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(225,245,238,0.4))',
      },
    },
  },
  plugins: [],
};
