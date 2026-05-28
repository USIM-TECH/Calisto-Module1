/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        calisto: {
          sidebar: '#3f4f4f',
          sidebarActive: '#566565',
          accent: '#d85f0d',
          ink: '#303133',
          muted: '#737b86',
          canvas: '#f6f4f1',
        },
      },
      boxShadow: {
        dashboard: '0 12px 30px rgba(31, 41, 55, 0.07)',
      },
    },
  },
  plugins: [],
}
