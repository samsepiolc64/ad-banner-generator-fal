/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#E84C0E',
          'orange-light': '#fff8f5',
          green: '#16a34a',
          'green-light': '#f0fdf4',
          red: '#dc2626',
          'red-light': '#fff1f1',
        },
      },
    },
  },
  plugins: [],
}
