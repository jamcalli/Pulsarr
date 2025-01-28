import type { Config } from 'tailwindcss'
import tailwindAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/client/index.html', './src/client/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
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
      borderRadius: {
        base: '5px',
      },
      boxShadow: {
        shadow: 'var(--shadow)',
      },
      translate: {
        boxShadowX: '4px',
        boxShadowY: '4px',
        reverseBoxShadowX: '-4px',
        reverseBoxShadowY: '-4px',
      },
      fontWeight: {
        base: '500',
        heading: '700',
      },
      keyframes: {
        starPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(0.95)' },
        },
        hardFlicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '25%, 75%': { opacity: '0.95' },
        },
        softFlicker: {
          '0%, 100%': { opacity: '0.1' },
          '50%': { opacity: '0.15' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        starPulse: 'starPulse 16s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        hardFlicker: 'hardFlicker 0.16s infinite',
        softFlicker: 'softFlicker 2s infinite',
      },
    },
  },
  plugins: [tailwindAnimate],
}

export default config
