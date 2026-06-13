/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#fdfbf7',
          100: '#f7f3eb',
          200: '#efe8d8',
          300: '#e5d9c0',
        },
        terracotta: {
          400: '#d97757',
          500: '#c45a3a',
          600: '#a84a2e',
        },
        sage: {
          400: '#7da085',
          500: '#5e8a68',
          600: '#4a6e52',
        },
        ink: {
          900: '#1a1a1a',
          800: '#2d2d2d',
          700: '#404040',
          600: '#555555',
          500: '#6b6b6b',
          400: '#888888',
          300: '#aaaaaa',
          200: '#cccccc',
          100: '#e5e5e5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
