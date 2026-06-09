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
        gemini: {
          blue: '#4285f4',
          red: '#ea4335',
          yellow: '#fbbc04',
          green: '#34a853',
          light: '#f8f9fa',
          border: '#dadce0',
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-blue': 'linear-gradient(to top, rgba(66, 133, 244, 0.15) 0%, transparent 50%)',
      }
    },
  },
  plugins: [],
}
