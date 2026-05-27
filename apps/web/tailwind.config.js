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
          950: '#061528',
        },
        accent: {
          DEFAULT: '#E8650A',
          light: '#f07828',
          dark: '#c45608',
        },
        cream: '#FBF7F2',
        surface: {
          DEFAULT: '#f8fafc',
          muted: '#eef2f7',
        },
      },
      backgroundImage: {
        'app-gradient':
          'linear-gradient(135deg, #061528 0%, #0F2D5E 42%, #123a72 68%, rgba(232, 101, 10, 0.18) 100%)',
        'app-glow':
          'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(232, 101, 10, 0.22), transparent)',
      },
    },
  },
  plugins: [],
};
