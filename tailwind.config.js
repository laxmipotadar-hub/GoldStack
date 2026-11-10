/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core Theme Tokens
        bg: '#FFFFFF',
        card: '#FFFDF7',
        chip: '#F5F1E6',
        border: '#E5E0D0',
        ink: '#1E293B',
        muted: '#64748B',
        brand: {
          DEFAULT: '#8C6D1F',
          light: '#B5893A'
        },
        success: {
          DEFAULT: '#16A34A',
          bg: '#ECFDF3'
        },
        danger: {
          DEFAULT: '#DC2626',
          bg: '#FEF2F2'
        },
        warn: {
          DEFAULT: '#D97706',
          bg: '#FFF4E0'
        },
        info: {
          DEFAULT: '#2563EB',
          bg: '#EFF6FF'
        },

        // Backward compatibility mappings
        primary: {
          DEFAULT: '#8C6D1F',
          container: '#B5893A'
        },
        'on-primary': '#FFFFFF',
        'primary-container': '#B5893A',
        'on-primary-container': '#FFFFFF',
        'primary-fixed-dim': '#B5893A',
        'primary-fixed': '#FFF4E0',

        secondary: {
          DEFAULT: '#8C6D1F',
          container: '#F5F1E6'
        },
        'on-secondary': '#FFFFFF',
        'secondary-container': '#F5F1E6',
        'on-secondary-container': '#1E293B',

        surface: '#FFFFFF',
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#FFFDF7',
        'surface-container': '#FFFDF7',
        'surface-container-high': '#F5F1E6',
        'surface-container-highest': '#F5F1E6',
        'on-surface': '#1E293B',
        'on-surface-variant': '#64748B',

        outline: '#E5E0D0',
        'outline-variant': '#E5E0D0',

        error: '#DC2626',
        'error-container': '#FEF2F2',
        'on-error': '#FFFFFF',
        'on-error-container': '#DC2626',

        'inverse-surface': '#1E293B',
        'inverse-on-surface': '#FFFDF7'
      },
      fontFamily: {
        'headline-xl': ['Playfair Display', 'serif'],
        'headline-lg': ['Playfair Display', 'serif'],
        'headline-md': ['Playfair Display', 'serif'],
        'headline-sm': ['Playfair Display', 'serif'],
        'metric-display': ['Manrope', 'sans-serif'],
        'metric-sub': ['Manrope', 'sans-serif'],
        'body-lg': ['Manrope', 'sans-serif'],
        'body-md': ['Manrope', 'sans-serif'],
        'body-sm': ['Manrope', 'sans-serif'],
        'label-md': ['Manrope', 'sans-serif'],
        'label-sm': ['Manrope', 'sans-serif'],
        'label-vernacular': ['Manrope', 'sans-serif']
      }
    }
  },
  plugins: []
};
