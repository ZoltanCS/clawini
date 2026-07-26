/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nim: {
          green: '#76b900',
          'green-dark': '#5a8e00',
        }
      },
      animation: {
        'message-slide-in': 'messageSlideIn 0.2s ease-out forwards',
        'slide-down': 'slideDown 0.2s ease-out forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'bounce': 'bounce 1.4s infinite ease-in-out',
      },
      keyframes: {
        messageSlideIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)', maxHeight: '0' },
          to: { opacity: '1', transform: 'translateY(0)', maxHeight: '100px' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        bounce: {
          '0%, 80%, 100%': { transform: 'scale(0.6)' },
          '40%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
