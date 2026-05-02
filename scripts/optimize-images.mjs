/**
 * Azure Lens Photography — Image Optimization Script
 * Converts all images in public/images/ to WebP and resizes appropriately.
 * Originals are backed up to public/images/_originals/
 *
 * Usage (local only — do NOT commit sharp to package.json):
 *   npm install sharp                    # install locally
 *   node scripts/optimize-images.mjs    # run optimizer
 *   npm uninstall sharp                  # remove before pushing
 */

import sharp from 'sharp';
import { readdir, mkdir, copyFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'public', 'images');

const CONFIG = {
  gallery: { maxWidth: 1200, quality: 82 },
  hero:    { maxWidth: 1920, quality: 85 },
};

const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tiff', '.bmp'];
const SKIP_DIRS  = ['_originals'];

async function getAllImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) files.push(...await getAllImages(fullPath));
    } else if (EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

async function kb(bytes) { return (bytes / 1024).toFixed(0) + 'kb'; }

async function optimizeImage(filePath) {
  const isHero   = basename(filePath).includes('hero-background');
  const config   = isHero ? CONFIG.hero : CONFIG.gallery;
  const relPath  = filePath.replace(IMAGES_DIR, '');
  const backup   = join(IMAGES_DIR, '_originals', relPath);
  const outPath  = filePath.replace(/\.[^.]+$/, '.webp');

  // Back up original once
  await mkdir(dirname(backup), { recursive: true });
  if (!existsSync(backup)) await copyFile(filePath, backup);

  const origSize = (await stat(filePath)).size;

  try {
    const image    = sharp(filePath);
    const meta     = await image.metadata();
    const pipeline = meta.width > config.maxWidth
      ? image.resize({ width: config.maxWidth, withoutEnlargement: true })
      : image;

    await pipeline.webp({ quality: config.quality, effort: 4 }).toFile(outPath);

    const newSize = (await stat(outPath)).size;
    const pct     = (((origSize - newSize) / origSize) * 100).toFixed(0);
    const renamed = outPath !== filePath;

    console.log(`  OK  ${basename(filePath).padEnd(55)} ${await kb(origSize)} -> ${await kb(newSize)} (-${pct}%)${renamed ? ' [-> .webp]' : ''}`);

    // Remove old non-webp file
    if (renamed) await unlink(filePath);

    return { origSize, newSize };
  } catch (err) {
    console.error(`  ERR ${basename(filePath)}: ${err.message}`);
    return { origSize, newSize: origSize };
  }
}

async function main() {
  console.log('\nAzure Lens — Image Optimizer');
  console.log('Originals backed up to public/images/_originals/\n');

  const images = await getAllImages(IMAGES_DIR);
  if (!images.length) { console.log('No images found.'); return; }
  console.log(`Found ${images.length} image(s)\n`);

  let totalOrig = 0, totalNew = 0;
  for (const img of images) {
    const { origSize, newSize } = await optimizeImage(img);
    totalOrig += origSize; totalNew += newSize;
  }

  const saved = (((totalOrig - totalNew) / totalOrig) * 100).toFixed(0);
  console.log(`\nTotal: ${await kb(totalOrig)} -> ${await kb(totalNew)} (-${saved}% / ${await kb(totalOrig - totalNew)} saved)`);
  console.log('\nNext step: commit the new .webp files and push.');
  console.log('The gallery pages auto-discover images via readdir() so no code changes needed.');
}

main().catch(console.error);
