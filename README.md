# Azure Lens Photography — Portfolio Site

Personal photography portfolio for **Azure Tincture**, a New York City photographer specialising in studio, fashion, commercial, on-location, and event photography.

**Live site:** [azurelens.work](https://azurelens.work)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Astro](https://astro.build) (static output) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Deployment | Cloudflare Workers (via `wrangler deploy`) |
| Image Storage | Cloudflare R2 (`azurelens-images` bucket) |
| Contact Form | Cloudflare Worker + [Resend](https://resend.com) email + D1 database |
| Analytics | Cloudflare Web Analytics (built-in) |
| DNS/CDN | Cloudflare (azurelens.work) |

---

## Project Structure

```
photoport/
├── public/
│   ├── images/
│   │   ├── hero-background.webp   # Homepage hero (in git)
│   │   ├── logo.webp              # Header logo (in git)
│   │   ├── favicon.webp           # Browser favicon (in git)
│   │   ├── studio/                # Gallery images (in R2, NOT in git)
│   │   ├── street/                # Gallery images (in R2, NOT in git)
│   │   ├── location/              # Gallery images (in R2, NOT in git)
│   │   └── misc/                  # Gallery images (in R2, NOT in git)
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Header.astro           # Navigation
│   │   ├── Footer.astro           # Footer with social links
│   │   └── PhotoGrid.astro        # Masonry gallery grid + lightbox
│   ├── layouts/
│   │   └── Layout.astro           # Base HTML layout, meta tags, JSON-LD
│   ├── lib/
│   │   └── getImages.mjs          # Image discovery (filesystem → R2 fallback)
│   ├── pages/
│   │   ├── index.astro            # Homepage
│   │   ├── studio.astro           # Studio gallery
│   │   ├── street.astro           # Street gallery
│   │   ├── location.astro         # On-location gallery
│   │   ├── miscellaneous.astro    # Miscellaneous gallery
│   │   ├── about.astro            # About page
│   │   ├── contact.astro          # Contact form
│   │   └── 404.astro              # Custom 404 page
│   └── worker.js                  # Cloudflare Worker entry point
├── scripts/
│   ├── optimize-images.mjs        # Convert images to WebP using sharp
│   └── upload-to-r2.mjs           # Upload images to Cloudflare R2
├── astro.config.mjs
├── wrangler.jsonc                  # Cloudflare Worker + R2 + D1 config
└── tailwind.config.mjs
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The dev server runs at `http://localhost:4321`. Gallery images will be empty locally unless you have the image subfolders in `public/images/` — that's fine for development.

---

## Adding New Photos

Gallery images are stored in **Cloudflare R2**, not in git. Adding new photos is a two-step process:

### Step 1 — Prepare your image

Convert to WebP first for best performance:

```bash
# Install sharp (one time, uninstall before pushing)
npm install sharp

# Run the optimizer — converts all images in public/images/ to WebP
# Originals are backed up to public/images/_originals/
npm run optimize

# Uninstall sharp before committing (prevents build failures)
npm uninstall sharp
```

Or convert manually and drop the `.webp` file directly into the right subfolder:
- `public/images/studio/` — studio/portrait work
- `public/images/street/` — street photography
- `public/images/location/` — on-location shoots
- `public/images/misc/` — everything else

### Step 2 — Upload to R2

```bash
# Login to Cloudflare (one time)
npx wrangler login

# Upload all images from public/images/ to the azurelens-images R2 bucket
npm run upload-images

# Or upload a single subfolder only
node scripts/upload-to-r2.mjs studio
```

### Step 3 — Trigger a new deployment

Either push a commit or manually trigger a deploy in the Cloudflare dashboard. The build server queries R2 to discover image filenames at build time, so a fresh deploy is needed after uploading.

```bash
git commit --allow-empty -m "chore: trigger deploy after image upload"
git push origin main
```

That's it — the gallery auto-discovers images via the R2 API. No code changes needed.

---

## Contact Form

The contact form POSTs to `/api/contact` which is handled by `src/worker.js`. It:

1. Validates the form fields
2. Stores the submission in a **Cloudflare D1** database (`contact-submissions` table)
3. Sends an email notification via **Resend**

### D1 Table Schema

Run this once in the Cloudflare Dashboard → D1 → `contact-submissions` → Console:

```sql
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Configuration

### wrangler.jsonc

Non-sensitive infrastructure config lives in `wrangler.jsonc` — worker name, bucket name, D1 database name/ID, and `RECIPIENT_EMAIL`. These are safe to commit.

### Cloudflare Dashboard — Bindings

Set in **Workers & Pages → shiny-voice-19bd → Bindings**:

| Variable | Type | Value |
|---|---|---|
| `IMAGES` | R2 Bucket | Name of your R2 bucket |
| `DB` | D1 Database | Name of your D1 SQL database |

### Cloudflare Dashboard — Runtime Secrets

Set in **Workers & Pages → Name of Cloudflare Worker → Settings → Variables and Secrets**:

| Variable | Type | Description |
|---|---|---|
| `RESEND_API_KEY` | Secret | Resend API key for contact form emails |
| `CLOUDFLARE_API_TOKEN` | Secret | API token with Workers R2 Storage:Read. **Do NOT add to Build section** — Cloudflare confuses it with the build auth token and breaks deployments. Runtime section only. |

### Cloudflare Dashboard — Build Variables

Set in **Settings → Build → Variables and Secrets** (needed during the build process):

| Variable | Type | Description |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Plaintext | Your Cloudflare Account ID |
| `R2_BUCKET_NAME` | Plaintext | Your R2 Bucket to load gallery pictures |

### Creating the Cloudflare API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **"Edit Cloudflare Workers"** template
4. Under Permissions, ensure **Account → Workers R2 Storage → Read** is included
5. Scope to your account
6. Create and copy the token

---

## Deploying Changes

The site auto-deploys when changes are pushed to the `main` branch via the Cloudflare Worker build integration.

```bash
git push origin main
```

Build command: `npm run build`
Deploy command: `npx wrangler deploy`

---

## Image Optimization Script

```bash
# Install sharp locally (do NOT commit to package.json)
npm install sharp

# Run optimizer
# - Converts all JPG/PNG in public/images/ to WebP
# - Resizes gallery images to max 1200px wide
# - Resizes hero to max 1920px wide
# - Backs up originals to public/images/_originals/ (gitignored)
npm run optimize

# Uninstall before pushing
npm uninstall sharp
```

---

## SpamAssassin Configuration (self-hosted email)

If you run your own mail server and contact form emails are flagged as spam, add to `/etc/spamassassin/local.cf`:

```
# Whitelist Resend sending addresses
whitelist_from *@azurelens.work

# Zero out .work TLD false positive penalties
score PDS_OTHER_BAD_TLD 0.0
score FROM_SUSPICIOUS_NTLD 0.0
score FROM_SUSPICIOUS_NTLD_FP 0.0
score FROM_NTLD_REPLY_FREEMAIL 0.0

# Trust Resend's sending IPs (Amazon SES us-east-1)
trusted_networks <ip/subnet>
```

Then restart SpamAssassin:
```bash
sudo spamassassin --lint
sudo systemctl restart spamassassin
```

---

## License

Personal portfolio — all photography © Azure Tincture. Code structure may be reused freely.
