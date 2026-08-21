import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7B2D8B',
          light: '#9B4DAB',
          dark: '#5B1D6B',
          subtle: '#fbf2fd',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
