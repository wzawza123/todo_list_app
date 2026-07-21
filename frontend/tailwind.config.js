/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        prio: {
          highest: '#dc2626',
          high: '#ea580c',
          medium: '#2563eb',
          low: '#9ca3af',
        },
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
      },
    },
  },
  plugins: [],
}
