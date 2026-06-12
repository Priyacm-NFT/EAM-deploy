/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F2D5E',
          light: '#1a4480',
          dark: '#0a1f42',
          950: '#060e1a',
        },
        // Orange accent — kept from original for all action buttons
        accent: {
          DEFAULT: '#E8650A',
          light: '#f07828',
          dark: '#c45608',
        },
        surface: {
          DEFAULT: '#f8fafc',
          muted: '#eef2f7',
        },
        // Additional modern palette tokens
        navy: {
          50: '#e6f1fb',
          100: '#b5d4f4',
          200: '#85b7eb',
          400: '#2d7de0',
          600: '#1e5fbf',
          800: '#0c447c',
          900: '#060e1a',
        },
      },
      backgroundImage: {
        'app-gradient':
          'linear-gradient(180deg, #060e1a 0%, #08122a 100%)',
        'app-glow':
          'radial-gradient(ellipse 70% 50% at 70% -10%, rgba(30, 95, 191, 0.15), transparent)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
      backdropBlur: {
        DEFAULT: '12px',
      },
    },
  },
  plugins: [],
};