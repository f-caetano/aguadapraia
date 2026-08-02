/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--cp-bg)',
        surface: 'var(--cp-surface)',
        border: 'var(--cp-border)',
        foreground: 'var(--cp-text)',
        muted: 'var(--cp-text-muted)',
        accent: 'var(--cp-accent)',
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '1rem',
      },
    },
  },
  plugins: [],
}
