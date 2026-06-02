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
          canvas: 'rgb(var(--color-calisto-canvas) / <alpha-value>)',
          surface: {
            DEFAULT: 'rgb(var(--color-calisto-surface) / <alpha-value>)',
            muted: 'rgb(var(--color-calisto-surface-muted) / <alpha-value>)',
          },
          sidebar: 'rgb(var(--color-calisto-sidebar) / <alpha-value>)',
          sidebarActive: 'rgb(var(--color-calisto-sidebar-active) / <alpha-value>)',
          accent: 'rgb(var(--color-calisto-accent) / <alpha-value>)',
          ink: 'rgb(var(--color-calisto-ink) / <alpha-value>)',
          body: 'rgb(var(--color-calisto-body) / <alpha-value>)',
          muted: 'rgb(var(--color-calisto-muted) / <alpha-value>)',
          soft: 'rgb(var(--color-calisto-soft) / <alpha-value>)',
          line: {
            DEFAULT: 'rgb(var(--color-calisto-line) / <alpha-value>)',
            subtle: 'rgb(var(--color-calisto-line-subtle) / <alpha-value>)',
          },
          table: 'rgb(var(--color-calisto-table) / <alpha-value>)',
          focus: 'rgb(var(--color-calisto-focus) / <alpha-value>)',
        },
      },
      boxShadow: {
        dashboard: '0 12px 30px rgba(31, 41, 55, 0.07)',
      },
    },
  },
  plugins: [],
}
