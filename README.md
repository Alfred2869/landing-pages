# Alpha Abilities - Meta campaign landing page

Single, self-contained landing page (`index.html`) for Alpha Abilities' Meta
ad campaign. Adapted from `lp-wireframe.html` per the build brief. No
frameworks, no build step, no dependencies beyond the Google Fonts link and
the Meta Pixel snippet.

## Deploy: Cloudflare Pages

- **Build command:** none
- **Output directory:** `/`
- **Auto-deploy:** on push to `main` (Cloudflare Pages watches the connected
  git repository and redeploys automatically on every push to `main`)

This is a static site with no build step, so Cloudflare Pages can serve the
repository root directly - just connect the repo, leave the build command
blank, set the output directory to `/`, and pushes to `main` go live
automatically. Free tier is enough for this traffic.

If Alpha Abilities' existing hosting can serve a standalone static page
instead, that works too - this page is fully self-contained and does not
touch alphaabilities.com.au or its WordPress theme either way.

## Before launch

Fill in the values left blank/placeholder in `index.html`:

- `FORM_ENDPOINT` and `META_PIXEL_ID` consts at the top of the page `<script>`
  in `<head>`
- `assets/logo.png` and `assets/mascot.png` (paths are already wired up with
  alt text and explicit dimensions; the `assets/` directory currently only
  holds a `.gitkeep`)
- Every other `[you to provide]` / `[you to confirm]` placeholder visible on
  the page (Google reviews profile URL, ABN, privacy policy link, therapist
  photos/names/bios, and the two confirmable timing facts in the hero and
  quiz outcome copy)

See the build brief for the full list and the section-by-section spec.
