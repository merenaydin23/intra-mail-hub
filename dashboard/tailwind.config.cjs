// tailwind.config.cjs
module.exports = {
  darkMode: 'class', // enable class-based dark mode
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        primary: '#008B8B', // turquoise accent
        secondary: '#6C757D', // neutral gray for secondary elements
        background: '#F4F7F6', // light background
        surface: '#FFFFFF', // card surface
        text: '#333333', // primary text color
        'text-muted': '#6C757D', // muted text
      },
      boxShadow: {
        float: '0 20px 40px -15px rgba(0,0,0,0.05)', // subtle floating shadow
        hover: '0 30px 60px -20px rgba(0,0,0,0.07)', // deeper on hover
      },
      borderRadius: {
        xl: '1.5rem',
        '2xl': '2rem',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'], // keep Outfit as default
      },
    },
  },
  plugins: [],
};
