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
        xs: ['14px', '20px'],
        sm: ['15px', '22px'],
      },
    },
  },
  plugins: [],
}
