/**
 * getImages(folder) — returns image paths for a gallery folder.
 * Tries local filesystem first, falls back to Cloudflare R2 API.
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in build env.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET     = 'azurelens-images';

export async function getImages(folder) {
  // 1. Try local filesystem
  try {
    const dir = join(process.cwd(), 'public', 'images', folder);
    const files = await readdir(dir);
    const images = files
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()
      .map(f => `/images/${folder}/${f}`);
    if (images.length > 0) {
      console.log(`[getImages] ${folder}: ${images.length} from filesystem`);
      return images;
    }
  } catch { /* fall through */ }

  // 2. Fall back to R2 API
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.warn(`[getImages] ${folder}: no local images and CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN not set`);
    return [];
  }

  try {
    const prefix = `images/${folder}/`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?prefix=${encodeURIComponent(prefix)}&delimiter=/`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    if (!res.ok) { console.error(`[getImages] R2 API ${res.status}`); return []; }
    const data = await res.json();
    const images = (data.result?.objects || [])
      .map(obj => `/${obj.key}`)
      .filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p))
      .sort();
    console.log(`[getImages] ${folder}: ${images.length} from R2`);
    return images;
  } catch (err) {
    console.error(`[getImages] R2 fetch failed:`, err);
    return [];
  }
}
