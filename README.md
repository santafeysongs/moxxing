# MOXX UP

Creative AI tool — upload subject photos + reference images, get the subject placed into scenes or outfits. Chrome aesthetic, anti-design that's incredibly designed.

## Stack

- **Frontend**: Next.js 14 (`apps/web`) — localhost:3000
- **API**: Express.js (`apps/api`) — localhost:4000
- **Database**: Neo4j (bolt://localhost:7687) — cultural graph with 632 nodes across 14 categories
- **Image Generation**: Google Gemini (model fallback chain: `gemini-3-pro-image-preview` → `nano-banana-pro-preview` → `gemini-2.5-flash-image`)
- **Recognition**: Anthropic Claude Sonnet — artist description, cultural node identification
- **Rendering**: Puppeteer — headless slide rendering for deck export
- **Scraping**: Puppeteer — Pinterest board scraping

## How to Run

```bash
# Install dependencies
npm install

# Copy and fill environment variables
cp .env.example .env
# Required: GEMINI_API_KEY, ANTHROPIC_API_KEY, NEO4J_URI/USER/PASSWORD

# Start API server
cd apps/api && npx ts-node src/index.ts

# Start web app (separate terminal)
cd apps/web && npm run dev
```

- Web: http://127.0.0.1:3000
- API: http://127.0.0.1:4000

Both are bound to localhost only (not exposed to network).

## Core Flow — Mockup Mode

1. **Upload** artist photos (face/body reference) + reference images (scenes/outfits) or paste a Pinterest board URL
2. System **describes the artist** via Claude (short identifier like "the person in the leather jacket")
3. **Randomly selects N references** from pool (default 30)
4. **Generates mockups** — each reference + all artist photos sent to Gemini with a single prompt
5. Results displayed in a **grid** (hover for download/rerun buttons)
6. **Generate Deck** → Puppeteer renders slides → PDF/PPTX export

## Two Modes

- **Scene**: Place the subject INTO the reference scene — matching lighting, framing, atmosphere
- **Wardrobe**: Take the CLOTHING from the reference person and put it ON the subject — full body head to toe

The reference image does 100% of the creative direction. Prompts are minimal (~30-50 words).

## Pinterest Scraping

Accepts Pinterest board URLs. Puppeteer scrolls the board, accumulating image URLs in a Set (Pinterest recycles DOM elements). Typically captures 180-190 images from a 175-pin board.

## Deck Export

Mockup images → orientation detection (portrait/landscape/square) → varied slide layouts (hero, trio, duo, split) → Puppeteer renders each slide to PNG → assembled into PDF. PPTX export via pptxgenjs from saved slide PNGs.

Decks persist to `data/mockup-decks/{deckId}/` with PDF, slide PNGs, and metadata.

## Model Fallback Chain

For image generation, models are tried in order:
1. `gemini-3-pro-image-preview`
2. `nano-banana-pro-preview`
3. `gemini-2.5-flash-image`

Auto-fallback on 429/quota errors.

## CONTEXX Pipeline (Full Campaign Mode)

The original campaign pipeline (separate from mockup):
1. Upload mood board images + artist photos + product refs + reference decks
2. Mood board analysis → cultural recognition → cross-referencing → thread-pull
3. Synthesis enrichment via Claude (manifesto, narrative, touchpoints)
4. AI image generation (scenes, products, logos)
5. Deck assembly → PDF/PPTX

## File Structure

```
apps/
  web/              Next.js 14 frontend
  api/              Express API server
    src/index.ts    All routes (campaigns, mockups, recognition, graph, deck)
packages/
  shared/           Shared TypeScript types
  graph-db/         Neo4j connection, queries, seed data
  analysis-engine/  Image analysis, Pinterest scraper, recognition, thread-pull
  deck-generator/   HTML slide templates → Puppeteer → PDF assembly
data/               Runtime data (campaigns, mockups, decks) — gitignored
scripts/            Build, deploy, data import
```

## Design

- **Fonts**: Unbounded (display), Space Grotesk (body)
- **Color**: Chrome/silver/metallic gradients
- **Landing page**: No nav, no explanation — chrome gradient "MOXX UP", blur-in animation
- **Results grid**: Black background, 5 columns, 1px gaps
