# CONTEXX Image Generation Pipeline — Next Update
## February 25, 2026

### The Problem
The current pipeline generates all campaign images from text prompts only. There are no actual reference images or artist photos being passed into the image generation calls. The result is that the first generated image becomes the visual anchor, and every subsequent image is a variation of that one scene.

### The Fix
Switch from text-only to multi-image prompts. Every Gemini call receives actual photos — an artist photo plus a reference environment — alongside text direction.

### Two Key Changes

#### 1. Multiple Artist Photos
Users upload multiple artist photos (up to 6-8). Different sections use different photos based on context. User can assign pairings manually or system suggests based on lighting/mood match.

#### 2. Featured References = Distinct Environments
Each featured reference becomes a different scene. The cohesion comes from shared visual parameters (color grade, grain, lighting temperature) not from literally being the same location.

### What Each Image Generation Call Looks Like
- Image 1: Artist photo (specific to this scene)
- Image 2: Reference environment (featured image)
- Text: Direction from synthesis + world bible constraints

### How Cohesion Works
First generated image anchors the visual system. After generation, extract visual parameters (hex palette, lighting direction, grain level, contrast, saturation). Pass these into every subsequent call. World bible provides structured visual rules.

### UI Changes Required
1. Artist photo upload accepts multiple photos (up to 6-8)
2. Featured reference selection stays the same (up to 10)
3. NEW: Pairing interface — assign which artist photo goes with which reference
4. "Merchandise" → "Product Design" ✅ DONE

### Code Impact
- Primary: `image-generator.ts` — multi-image Gemini calls ✅ PARTIALLY DONE
- New: Image pairing logic (artist photos → featured references)
- New: World bible generation ✅ DONE (`world-bible.ts`)
- Secondary: `batch-analyzer.ts`, `product-designer.ts` ✅ RENAMED, templates.ts

### Build Order
1. Multi-image prompting with artist photo + reference pairing
2. World bible as intermediate pipeline step ✅ DONE
3. Pairing UI (artist photo ↔ reference)
4. Visual parameter extraction from anchor image
5. Product design module ✅ RENAMED AND REBUILT

### Market Context
- Weavy (Figma acquisition, Oct 2025) and Flora ($42M Series A, Jan 2026) are general-purpose
- Contexx is purpose-built for artist creative direction across every surface
- Target: creative directors at labels, management, artist brands
- Replaces 20+ hours manual work or $5-10K freelance strategists
- Price point: $150/month per seat
