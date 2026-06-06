/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'gradient-shift':  'gradient-shift 12s ease infinite',
        'float-slow':      'float 8s ease-in-out infinite',
        'float-fast':      'float 4s ease-in-out infinite',
        'pulse-glow':      'pulse-glow 4s ease-in-out infinite',
        'fade-up':         'fade-up 0.7s ease-out forwards',
        'shimmer':         'holo-shimmer 2.5s linear infinite',
        'neon-flicker':    'neon-flicker 5s ease-in-out infinite',
        'data-stream':     'data-stream 8s linear infinite',
        'border-flow':     'border-flow 4s ease infinite',
        'glitch':          'glitch 3s ease-in-out infinite',
        'marquee':         'marquee 28s linear infinite',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':       { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-14px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4', filter: 'blur(40px)' },
          '50%':      { opacity: '0.9', filter: 'blur(60px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(28px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'holo-shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'neon-flicker': {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.4' },
        },
        'data-stream': {
          from: { transform: 'translateY(-100%)' },
          to:   { transform: 'translateY(100%)' },
        },
        'border-flow': {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 1px)' },
          '40%': { transform: 'translate(2px, -1px)' },
          '60%': { transform: 'translate(-1px, 2px)' },
          '80%': { transform: 'translate(1px, -2px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(-50%)' },
        },
      },
      backgroundSize: {
        '300%': '300% 300%',
        '200%': '200% auto',
      },
      colors: {
        cp: {
          black:   '#050508',
          dark:    '#0a0a0f',
          surface: '#0f0f1a',
          red:     '#ff2d3b',
          'red-dim': '#E84142',
          cyan:    '#00f5ff',
          magenta: '#f700ff',
          border:  'rgba(255,255,255,0.06)',
        },
        primary: {
          50:  '#fff0f0',
          100: '#ffe0e0',
          200: '#ffc0c0',
          300: '#ff9090',
          400: '#f87171',
          500: '#ff2d3b',
          600: '#E84142',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        neon: {
          red:     '#ff2d3b',
          cyan:    '#00f5ff',
          magenta: '#f700ff',
          green:   '#00ff88',
          amber:   '#ffb800',
        },
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        danger: {
          400: '#f87171',
          500: '#ff2d3b',
          600: '#dc2626',
        },
      },
      fontFamily: {
        sans:    ['Space Grotesk', 'system-ui', 'sans-serif'],
        display: ['Orbitron', 'Space Grotesk', 'system-ui', 'sans-serif'],
        mono:    ['Share Tech Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'neon-red':     '0 0 8px rgba(255,45,59,0.4), 0 0 20px rgba(255,45,59,0.2)',
        'neon-red-lg':  '0 0 16px rgba(255,45,59,0.5), 0 0 40px rgba(255,45,59,0.25)',
        'neon-cyan':    '0 0 8px rgba(0,245,255,0.3), 0 0 20px rgba(0,245,255,0.15)',
        'neon-cyan-lg': '0 0 16px rgba(0,245,255,0.4), 0 0 40px rgba(0,245,255,0.2)',
        'neon-mag':     '0 0 8px rgba(247,0,255,0.3), 0 0 20px rgba(247,0,255,0.15)',
        'glass':        '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
