#!/bin/bash

# Create directory structure
mkdir -p src/layouts
mkdir -p src/components
mkdir -p src/pages
mkdir -p public/images/studio
mkdir -p public/images/street
mkdir -p public/images/location
mkdir -p public/images/misc

# Create empty files
touch src/layouts/Layout.astro
touch src/components/Header.astro
touch src/components/Footer.astro
touch src/components/PhotoGrid.astro
touch src/pages/index.astro
touch src/pages/studio.astro
touch src/pages/street.astro
touch src/pages/location.astro
touch src/pages/miscellaneous.astro
touch src/pages/contact.astro
touch astro.config.mjs
touch tailwind.config.mjs
touch package.json

echo "✅ Project structure created successfully!"