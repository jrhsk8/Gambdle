# Lunchboxd logo — usage

Final mark: direction **2a** — outline lunchbox with orange star.

## Files
- `lunchboxd-mark-on-dark.svg` — white outline, for dark backgrounds (primary; the brand ground is #1a1815)
- `lunchboxd-mark-on-light.svg` — near-black outline (#1a1815), for light backgrounds
- `lunchboxd-favicon.svg` — clay tile (#d98b6a), white lunchbox + white star; use for favicon / app icon / avatar

## Colors
- Outline on dark: #fcfcfc · Outline on light: #1a1815
- Star: #fca044 (always orange, both themes)
- Accent / tile: #d98b6a (hover #e49b7c)
- Ground: #1a1815 · Panel: #221f1b

## Wordmark
No separate wordmark file — set it in type next to the mark:

```html
<span style="font-family:'Schibsted Grotesk',sans-serif; font-weight:800; letter-spacing:-0.02em; color:#efe9e0;">lunchbox<span style="color:#d98b6a;">d</span></span>
```

All lowercase, the final "d" in accent clay. On light grounds use #1a1815 for the text.

## Lockup + sizing
- Icon height ≈ 1.25× the wordmark cap height; gap ≈ 0.4× icon width; vertically center.
- Clear space: keep ≥ 25% of the icon's width empty on all sides.
- Minimum sizes: mark 16px (favicon uses the tile version, star drops out below 20px is fine), lockup 24px tall.
- Navbar: 24px mark + 17px/800 wordmark.

## Don'ts
- Don't recolor the star to match the outline (except inside the favicon tile).
- Don't add a lid seam, latch, or other detail — the mark is deliberately plain.
- Don't stretch; the box is wider than tall by design.
- Don't place the white-outline version on light grounds (and vice versa).
