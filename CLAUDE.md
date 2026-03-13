# CLAUDE.md — MOXX UP

## What This Is

MOXX UP is a creative AI tool. Upload subject photos + reference images → AI puts the subject into scenes or outfits. Two modes: **Scene** (into settings) and **Wardrobe** (into clothes, full body).

The underlying engine is **CONTEXX** — a cultural recognition engine with 14 categories and 632 Neo4j nodes that powers thread-pull and synthesis.

## Stack

- **Frontend**: Next.js 14 (`apps/web`) — localhost:3000
- **API**: Express.js (`apps/api`) — localhost:4000
- **Database**: Neo4j — bolt://localhost:7687, user: neo4j, pw: culturalgraph
- **Image Gen**: Google Gemini (fallback chain: gemini-3-pro-image-preview → nano-banana-pro-preview → gemini-2.5-flash-image)
- **Recognition**: Anthropic Claude Sonnet
- **Rendering/Scraping**: Puppeteer (headless only — never open browser windows)
- **Monorepo**: npm workspaces + Turborepo

## Running Locally

```bash
# Install
npm install

# Start API (terminal 1)
cd apps/api && npx ts-node src/index.ts

# Start web (terminal 2)  
cd apps/web && npm run dev
```

Both bound to 127.0.0.1 only.

## Project Structure

```
apps/
  web/              Next.js 14 frontend
    src/app/
      page.tsx        Landing page (chrome gradient, blur-in animation)
      mockup/page.tsx Main mockup interface
      create/page.tsx Campaign creation (CONTEXX pipeline)
      graph/page.tsx  Graph visualization
  api/
    src/index.ts    All Express routes (campaigns, mockups, recognition, graph, deck)

packages/
  shared/           TypeScript types
  graph-db/         Neo4j connection + queries + seed data
  analysis-engine/  Image analysis, Pinterest scraper, recognition, thread-pull, image generation
  deck-generator/   HTML slide templates → Puppeteer → PDF/PPTX assembly

data/               Runtime data (gitignored) — campaigns, mockups, decks
scripts/            Scrapers (arena, behance, pinterest), import, ingest
```

## Core Concepts

### Mockup Flow
1. Upload artist photos (face/body) + reference images (or paste Pinterest board URL)
2. Claude describes the artist (short identifier like "the person in the leather jacket")
3. System selects N references from pool (default 30)
4. Gemini generates mockups — each reference + all artist photos → single prompt
5. Results displayed in grid (hover for download/rerun)
6. Generate Deck → Puppeteer renders slides → PDF/PPTX

### CONTEXX Pipeline (Full Campaign)
1. Upload mood board + artist photos + product refs + reference decks
2. Mood board analysis → cultural recognition → cross-referencing → thread-pull
3. Synthesis enrichment via Claude (manifesto, narrative, touchpoints)
4. AI image generation (scenes, products, logos)
5. Deck assembly → PDF/PPTX

### Pinterest Scraper
Puppeteer scrolls boards, accumulates URLs in a Set (DOM recycling). Gets ~180-190 images from a 175-pin board.

## Design Principles

- **Reference images ARE the creative direction** — prompts just say "put this person in that world"
- **Short prompts** (~30-50 words) — long prompts make AI images look AI
- **Never call it "merch"** — it's "products"
- Products render IN the campaign world
- **No anchor chaining** — cohesion comes from references only
- **Recognition = understanding lineage**, not tagging

## Aesthetic

- **Fonts**: Unbounded (display), Space Grotesk (body)
- **Color**: Chrome/silver/metallic gradients. Anti-design that's incredibly designed. "Brat energy but chrome."
- **Landing page**: No nav, no explanation. If you get it, you get it.
- **Results grid**: Black background, 5 columns, 1px gaps

## Deck Export

Mockup images → orientation detection → varied slide layouts (hero, trio, duo, split) → Puppeteer renders slides to PNG → PDF assembly. PPTX via pptxgenjs. Decks persist to `data/mockup-decks/{deckId}/`.

Max 3 photos per page. Clean editorial aesthetic.

## Environment Variables

Copy `.env.example` to `.env`. Required:
- `GEMINI_API_KEY` — image generation
- `ANTHROPIC_API_KEY` — recognition/synthesis
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` — graph database
- `NEXT_PUBLIC_API_URL=http://localhost:4000`

## Key Technical Notes

- HEIC support via `heic-convert` (sharp can't decode HEIC)
- Multer configured with memory storage, 50MB limit
- Gemini auto-fallback on 429/quota errors
- All API routes in single file: `apps/api/src/index.ts`
- Puppeteer is headless only — **do not open visible browser windows**

## Git

Repo initialized. `.gitignore` covers node_modules, .next, dist, .env, data/, tmp/.

## Coding Conventions

### TypeScript
- Strict TypeScript throughout. `tsconfig.base.json` at root, each package extends it.
- Use `import` paths like `@cultural-graph/analysis-engine/src/...` (workspace references, not compiled dist).
- API server is a **single file**: `apps/api/src/index.ts` — all routes live there. It's big and that's fine for now.

### API Patterns
- Express routes with multer for file uploads (memory storage, 50MB limit).
- `express.json({ limit: '100mb' })` for large base64 payloads.
- Campaigns persist to `data/campaigns/{id}/` as JSON + PDF files.
- Mockup decks persist to `data/mockup-decks/{deckId}/` with slide PNGs + metadata.
- HEIC detection via magic bytes, conversion with `heic-convert` (not sharp).
- Image resizing: artist photos → 800px (Claude) / 1024px (Gemini), references → 1536px.

### Frontend Patterns
- Next.js 14 App Router. Pages in `apps/web/src/app/`.
- Fonts: `Unbounded` (display, imported via next/font) + `Space Grotesk` (body).
- Global CSS in `globals.css`. Scoped `!important` overrides where needed (dark theme conflicts).
- Video background (`0227.mov`) on all screens at varying opacity (15% on results/deck preview).
- Mobile responsive: 2 cols phone, 3 tablet, 5 desktop on results grid.

### Image Generation
- Gemini model fallback chain with auto-retry on 429.
- ALL artist photos sent into every prompt (multi-angle understanding).
- Prompts are SHORT (~30-50 words). The reference image does the creative direction.
- Two modes need different prompt structures:
  - **Scene**: "Place {artist} into the reference scene. Match lighting, framing, atmosphere..."
  - **Wardrobe**: "Take the clothing from the reference person and put it on {artist}. Full body, head to toe..."
- Artist description = simple unique identifier ("the person in the leather jacket"), NOT detailed physical description.

### Puppeteer
- **Always headless**. Never open visible browser windows.
- Used for: deck slide rendering (HTML → PNG), Pinterest scraping, PDF assembly.
- Pinterest scraping uses Set accumulation across scrolls (DOM recycling workaround).

### General
- `uuid` for all IDs.
- `dotenv` config loaded from root `.env` via relative path.
- No tests yet. No linting config beyond TypeScript.
- Turborepo for build orchestration but `turbo run dev` for parallel dev servers.

## Current TODOs (as of Feb 28, 2026)

### High Priority
- [ ] Auto-classify mockups into sections (photography, cover art, editorial, etc.) for smarter deck organization
- [ ] Real mockup images on landing page (replace gray placeholders)
- [ ] Apply Pinterest design reference Andrew shared: `https://i.pinimg.com/736x/52/a5/9c/52a59cb755f231b92825c8ca87865a97.jpg`
- [ ] Shuffle/cascade animation on results grid load

### Security / Ops
- [ ] Rotate API keys: Anthropic, OpenAI, Are.na, Apify (exposed in chat history)
- [ ] Set up ngrok for demo sharing (installed via brew, not configured)

### Cleanup
- [ ] ~30 remaining decorative function references in less-used deck templates (old collage/tape/torn paper style)
- [ ] Dead code audit across analysis-engine

### Future
- [ ] User accounts / auth
- [ ] Cloud deployment (currently localhost only)
- [ ] Separate The Graft (3D graph viz, white-on-black) into its own package/app

## Key Decisions Log

These are settled — don't revisit unless Andrew says otherwise:

- **NO lightbox/star curation** — workflow is rerun-until-all-good, then export whole grid as deck
- **Landing page and mockup page are ONE page** (`/mockup`) — `/` redirects to `/mockup`
- **Nav hidden on mockup page** — MOXX UP title is in the hero
- **Rerun = new random reference**, not same reference with different prompt
- **Max 3 photos per deck page** — killed 2×2 grid layouts
- **No anchor chaining** — cohesion from references only
- **Products render IN the campaign world** — never isolated product shots
- **Never call it "merch"** — it's "products"
- **"Mock Up" is the core product** — the CONTEXX pipeline is the engine underneath, but mockup mode is what people use

## Related Products

- **The Graft**: 3D interactive graph visualization (monochromatic: white on black) — separate product from the same CONTEXX engine
