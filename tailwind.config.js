/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'gray-900': '#1A202C',
        'blue-600': '#3182CE',
        'blue-700': '#2B6CB0',
        'blue-400': '#63B3ED',
        'blue-300': '#90CDF4',
        'red-400': '#FC8181',
        'red-900': '#742A2A',
        'yellow-900': '#744210',
        'green-900': '#2F855A',
      },
    },
  },
  plugins: [],
};