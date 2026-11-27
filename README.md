# jjs

Image/Video → JJS custom moveset converter.

Upload an image or video and convert it into a **real JJS Skill Builder import code** (base64 → zstd → JSON) that you can paste into Jujutsu Shenanigans' Character Block configure menu.

> **Disclaimer:** Codes are generated in the verified JJS import-code format. They may break after JJS game updates. Import via: Private Server → Free Build → Place Character Block → Configure → Import/Clipboard → paste code.

## Features
- Fully client-side — works on **Cloudflare Pages, GitHub Pages, or any static host**. No backend required.
- Image/video upload → color block grid (positions, colors, sizes, opacity)
- Resolution sets the number of blocks along the longest side. For example, a 16:9 image at resolution 32 uses a 32 × 18 grid. Uncheck **Keep original proportions** to stretch the upload to a square.
- Blocks touch by default with adjustable gap/spacing between them
- Adjustable resolution, block size, gap, alpha threshold, and color mode
- Live dual-panel canvas preview (original vs. block moveset)
- Duration control for block lifetime
- Video frame rate control for frame-by-frame extraction
- Generates **real JJS import codes** (base64 + zstd compressed JSON)
- Decode existing JJS moveset codes back to JSON
- Copy to clipboard / download `.jjsmoveset` / `.json`

## Stack
- Frontend: vanilla HTML/CSS/JS
- zstd compression: `zstd-codec` library loaded from CDN in the browser
- Format: JSON → zstd (level 19, content size on, checksum off) → base64

## Deployment

### Cloudflare Pages
1. Connect your GitHub repo to Cloudflare Pages
2. Build command: none (static site)
3. Build output directory: `/` (root)
4. Deploy

### GitHub Pages
1. Enable GitHub Pages in repo settings
2. Select source branch (e.g., `main`)
3. Your site will be at `https://<user>.github.io/jjs/`

### Local development
```bash
node server/index.js
# Open http://localhost:8765
```

## Files
- `index.html` — frontend UI
- `style.css` — styling
- `app.js` — frontend media processing + client-side zstd encode/decode
- `server/index.js` — optional Node.js server for local testing
- `README.md` — this file
