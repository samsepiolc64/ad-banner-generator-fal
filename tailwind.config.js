/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        'step-in': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'step-in': 'step-in 0.3s ease-out both',
      },
      colors: {
        brand: {
          orange: '#E84C0E',
          'orange-light': '#fff8f5',
          green: '#16a34a',
          'green-light': '#f0fdf4',
          red: '#dc2626',
          'red-light': '#fff1f1',
          navy: '#0F172A',
          'navy-800': '#1E293B',
          blue: '#0369A1',
          'blue-600': '#0284C7',
        },
      },
    },
  },
  plugins: [],
}
