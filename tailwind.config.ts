import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#3b82f6',
          dark: '#1e40af',
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f8fafc',
          muted: '#f1f5f9',
          border: '#e2e8f0',
          dark: '#0f172a',
          'dark-subtle': '#1e293b',
          'dark-muted': '#334155',
          'dark-border': '#334155',
        },
        danger: {
          DEFAULT: '#dc2626',
          hover: '#b91c1c',
          light: '#ef4444',
        },
        success: {
          DEFAULT: '#16a34a',
          hover: '#15803d',
          light: '#22c55e',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
