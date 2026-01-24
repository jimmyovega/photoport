import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  adapter: undefined,
  site: 'https://portfolio.vrc6.com', // Replace with your actual domain
}); 