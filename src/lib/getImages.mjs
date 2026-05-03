/**
 * getImages(folder) — returns image paths for a gallery folder.
 * Tries local filesystem first, falls back to Cloudflare R2 S3-compatible API.
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

  // 2. Fall back to R2 S3-compatible API (list objects)
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.warn(`[getImages] ${folder}: no local images and credentials not set`);
    return [];
  }

  try {
    // Use S3-compatible XML API — more reliable than REST API for listing
    const prefix = `images/${folder}/`;
    const url = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=/`;

    // Generate AWS Signature V4 for R2 auth
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z';
    const dateOnly = dateStr.substring(0, 8);

    // Simple approach: use the API token as bearer via the CF REST API instead
    // CF REST API v4 endpoint for listing R2 objects
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects`;
    const params = new URLSearchParams({ prefix, delimiter: '/' });

    const res = await fetch(`${listUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });

    const text = await res.text();
    console.log(`[getImages] ${folder}: R2 API status ${res.status}`);

    if (!res.ok) {
      console.error(`[getImages] R2 API error: ${text.substring(0, 200)}`);
      return [];
    }

    const data = JSON.parse(text);
    console.log(`[getImages] ${folder}: result keys: ${Object.keys(data.result || {}).join(', ')}`);

    // Handle different response shapes
    const objects = data.result?.objects || data.result?.items || data.result || [];
    const arr = Array.isArray(objects) ? objects : [];

    const images = arr
      .map(obj => `/${obj.key || obj.name || ''}`)
      .filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p))
      .sort();

    console.log(`[getImages] ${folder}: ${images.length} from R2`);
    return images;
  } catch (err) {
    console.error(`[getImages] R2 fetch failed: ${err.message}`);
    return [];
  }
}
