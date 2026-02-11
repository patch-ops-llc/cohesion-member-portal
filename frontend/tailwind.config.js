/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0f1b5e',
          50: '#f0f2fb',
          100: '#e1e5f7',
          200: '#c3cbef',
          300: '#9eabe4',
          400: '#7687d6',
          500: '#5568c8',
          600: '#424fba',
          700: '#3841a1',
          800: '#313884',
          900: '#0f1b5e',
          950: '#0a1040'
        },
        accent: {
          DEFAULT: '#f39c12',
          50: '#fefaec',
          100: '#fcf2c9',
          200: '#f9e48e',
          300: '#f6d054',
          400: '#f4bd2d',
          500: '#f39c12',
          600: '#d7770c',
          700: '#b2540d',
          800: '#914211',
          900: '#773712'
        },
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107'
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: []
}
