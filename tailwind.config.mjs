/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'industrial-dark': '#1a1f2e',
        'industrial-blue': '#2d3e50',
        'cool-blue': '#4a6fa5',
        'accent-blue': '#6b9bd1',
        'light-gray': '#e8eaed',
      },
    },
  },
  plugins: [],
}