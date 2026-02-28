# Feature Spec: Image Regeneration with Reference Upload

Saved from Andrew's spec — Feb 25, 2026.
Build after core pipeline is stable.

## Key Points
- Per-image regeneration with right-side drawer (400px)
- 3 tiers: quick re-roll (same prompt new seed), prompt edit, reference-driven (img2img)
- Drawer stays open between images for rapid iteration
- Generation history per image for undo
- POST /api/deck/{deck_id}/image/{image_id}/regenerate
- Store per-image metadata: prompt, params, seed, reference, history

## Typography Insight
Skip AI generation for wordmarks entirely. Use actual font rendering:
- Node canvas or Puppeteer to render artist name in 4-6 fonts
- Zero API cost, perfect spelling, infinite variations
- Export as SVG or high-res PNG
- This is a typesetting task, not an image generation task
