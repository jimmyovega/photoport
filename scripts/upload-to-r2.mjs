/**
 * Azure Lens Photography — R2 Bulk Upload Script
 *
 * Uploads all images from public/images/ to the azurelens-images R2 bucket.
 * Preserves the directory structure so /images/studio/foo.webp in the bucket
 * maps to https://azurelens.work/images/studio/foo.webp on the site.
 *
 * Usage:
 *   npx wrangler login          (first time only)
 *   node scripts/upload-to-r2.mjs
 *
 * Or to upload a single subfolder:
 *   node scripts/upload-to-r2.mjs studio
 */

import { execSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'public', 'images');
const BUCKET = process.env.R2_BUCKET_NAME || 'your-r2-bucket-name';
const SKIP_DIRS = ['_originals'];
const SUBFOLDER_FILTER = process.argv[2] || null;

async function getAllImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      if (SUBFOLDER_FILTER && entry.name !== SUBFOLDER_FILTER) continue;
      files.push(...await getAllImages(fullPath));
    } else if (/\.(webp|jpg|jpeg|png|gif|svg)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log(`\nAzure Lens — R2 Upload to "${BUCKET}"\n`);
  if (SUBFOLDER_FILTER) console.log(`Filtering to subfolder: ${SUBFOLDER_FILTER}\n`);

  const images = await getAllImages(IMAGES_DIR);
  if (!images.length) { console.log('No images found.'); return; }
  console.log(`Found ${images.length} image(s) to upload\n`);

  let success = 0;
  let failed = 0;

  for (const imgPath of images) {
    // Key in R2 = "images/studio/foo.webp" (relative to public/)
    const key = relative(join(__dirname, '..', 'public'), imgPath).replace(/\\/g, '/');
    const sizeMb = ((await stat(imgPath)).size / 1024).toFixed(0);

    try {
      execSync(
        `npx wrangler r2 object put "${BUCKET}/${key}" --file "${imgPath}" --content-type "image/webp" --remote`,
        { stdio: 'pipe' }
      );
      console.log(`  OK  ${key.padEnd(60)} ${sizeMb}kb`);
      success++;
    } catch (err) {
      console.error(`  ERR ${key}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} uploaded, ${failed} failed`);
  if (failed === 0) {
    console.log('\nAll images are now in R2.');
    console.log('You can safely remove public/images/ from git (keep _originals backup).');
    console.log('Add public/images/ to .gitignore to stop tracking them.');
  }
}

main().catch(console.error);
