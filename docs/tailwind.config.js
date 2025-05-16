/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    '../src/client/components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '490px',
      },
      fontFamily: {
        sans: ['Shuttleblock', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Shuttleblock', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        main: 'var(--main)',
        overlay: 'var(--overlay)',
        bg: 'var(--bg)',
        bw: 'var(--bw)',
        blank: 'var(--blank)',
        text: 'var(--text)',
        mtext: 'var(--mtext)',
        border: 'var(--border)',
        ring: 'var(--ring)',
        ringOffset: 'var(--ring-offset)',
        secondaryBlack: '#212121',
        error: 'var(--error)',
        fun: 'var(--fun)',
        orange: 'var(--orange)',
      },
      keyframes: {
        hardFlicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '25%, 75%': { opacity: '0.95' },
        },
        softFlicker: {
          '0%, 100%': { opacity: '0.1' },
          '50%': { opacity: '0.15' },
        },
      },
      animation: {
        hardFlicker: 'hardFlicker 0.16s infinite',
        softFlicker: 'softFlicker 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
