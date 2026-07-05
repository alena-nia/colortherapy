# Chroma — Color Therapy

A calm, ad-free full-screen color experience. Turn your phone, tablet, or monitor
into a soft ambient color field for relaxation. Installable PWA — runs in the
browser, installs to the home screen, works offline. No accounts, no tracking;
settings stay in your browser's local storage.

## Modes

- **Solid** — one color holds, then slowly crossfades to the next.
- **Gradient** — soft horizontal color layers that drift.
- **Breathing** — a glow that expands and contracts at a calm breathing rhythm.
- **Rainbow** — a vivid spectrum scrolling left→right in wide, equal bands.

## Palettes

Soft (pastel) · Vivid (saturated) · Blend · Warm · Cool. Every mode, including
Rainbow, follows the chosen palette.

## Controls

Tap anywhere to reveal the panel (auto-hides): mode, palette, **Speed** (2–90s
per color / scroll pace), **Brightness** dimmer, and a **Session** timer that
fades to black when done. Plus a full-screen toggle and screen keep-awake.

## Design notes

- Colors are built and blended in **OKLCH** so transitions stay clean and
  luminous instead of passing through muddy sRGB midpoints (with an HSL/sRGB
  fallback for older browsers).
- Transitions are deliberately slow and never flash (eye-comfort / photosensitivity).
- No medical claims — this is a relaxation/ambience tool.

## Run locally

Serve over HTTP (a service worker needs http/https, not `file://`):

```bash
python -m http.server 8090
# open http://127.0.0.1:8090
```

## Deploy

Static files only — any static host works. Deployed on Vercel; pushing to the
linked GitHub repo auto-deploys. Bump `CACHE` in `sw.js` when shipping changes so
installed clients pick up the new version.
