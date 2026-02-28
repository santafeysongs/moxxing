# Culture & Context — Deck Generation System Spec

## For: AI Coding Agent (Claude Code / Cursor / Windsurf)

## Context: This spec defines the deck generation pipeline for Culture & Context, an AI-powered creative direction tool for the music industry.

---

## EXISTING CODEBASE

**Project root**: `/Users/moshii/.openclaw/workspace/cultural-graph/`

The project is a Turborepo monorepo with:
- `apps/api/` — Express backend (port 4000)
- `apps/web/` — Next.js 14 frontend (port 3000)
- `packages/analysis-engine/` — AI analysis (Claude Vision, Gemini image gen, Pinterest scraper, YouTube analyzer, entity ingestion)
- `packages/deck-generator/` — Current deck system (29 HTML/CSS templates, Puppeteer→PNG→pdf-lib→PDF, pptxgenjs for PPTX)
- `packages/graph-db/` — Neo4j connection + queries
- `packages/shared/` — Shared types

**What already works**: Full campaign flow — upload images → Claude Vision analyzes each → synthesize into unified MoodBoardAnalysis → Gemini generates 25 AI images → assemble ~45-slide deck → export PDF/PPTX.

**What this spec replaces**: The current `packages/deck-generator/src/templates.ts` (29 templates) and `packages/deck-generator/src/assembler.ts`. The analysis engine stays as-is.

---

## THE PROBLEM

The current deck templates produce generic programmatic output. The founder (SVP of Creative at Atlantic Records) hand-builds decks in Canva that look and feel completely different — signature design language, opinionated writing, curated reference imagery. The AI deck needs to get 60-70% of the way to that quality so the founder can finish it in 30-60 minutes instead of 3 days.

---

## THREE DECK TYPES

The system must recognize and generate three distinct deck types. Infer from user inputs, or let user select.

### Type 1: CAMPAIGN DECK (25-40 slides)
**When**: User mentions an album/project name, rollout, or release
**Structure**: Manifesto → Mood Board → Photography Direction → Album/Single Art → Video Overview → Per-Song Video Treatments → Live Performance → Styling → Rollout Strategy
**Character**: Writing-heavy, narrative-driven, strategic. The War and Treaty example: 32 slides, deep video treatment (12 slides for one song), three-act rollout structure.

### Type 2: PROJECT DECK (40-75 slides)
**When**: User wants comprehensive creative direction across all touchpoints for an era
**Structure**: Table of Contents → Photography → Logo/Design → Music Videos (per-song treatments) → Visualizers → Short Form → Live Shows → Merch → Appendix Imagery
**Character**: Image-heavy, section headers do the talking, writing is punchy and brief. The Jutes example: 75 slides, organized by touchpoint category.

### Type 3: IDENTITY BIBLE (15-25 slides)
**When**: User uploads artist photos and wants brand foundation, no specific release mentioned
**Structure**: Artist Manifesto → Aesthetic Pillars (3 buckets) → Styling Direction → Color Palette → Content Strategy Formula → Photography Assessment (Where We Are / Where We Can Go)
**Character**: Framework-heavy, meant to guide ongoing content decisions. The Cameron Whitcomb example: ~16 unique slides, content pillar system (Performer/Icon/Person).

---

## DESIGN LANGUAGE

All three deck types share a consistent visual identity. This is the founder's signature look.

### Typography
- **Section headers**: Hand-drawn lettering on masking tape strips. ALL CAPS, rough/punk aesthetic. The masking tape is a real texture element — torn edges, slightly off-white, with hand-written black marker text on top.
- **Body text**: Monospace/typewriter font (similar to Courier or a mono-serif). Lower-case preferred. Warm, analog feel.
- **Display text**: Bold mono or slab-serif for emphasis words.

### Color Themes (alternating)
- **Light slides**: Off-white/paper texture background (#f5f0e8 range), coffee-stain marks in corners, dark brown text (#282828). Used for section dividers and framework slides.
- **Dark slides**: Matte dark brown/charcoal (#3d3630 range), cream/white text. Used for content slides with text + image collages.
- **Black slides**: Pure black background, white text with no texture. Used as a cleaner variant for some content.

### Image Treatment
- **Photo collages**: Multiple images arranged asymmetrically, as if taped to a physical board
- **Black tape strips**: Small rectangles of black tape at corners/edges of photos (like physical mounting tape)
- **Mixed sizes**: Images at different scales within the same slide — one large hero + 2-3 smaller supporting
- **Slight rotation**: Some images tilted 1-3 degrees for organic feel
- **Photo styles**: Mix of color and B&W within the same slide

### Layout Patterns
- **Text-left / Images-right**: Body copy on the left ~40% of slide, collaged images filling the right ~60%
- **Full-bleed section dividers**: Masking tape header centered on light background, nothing else
- **Framework slides**: 3-column layout with torn paper cards (for content pillars, strategy buckets)
- **Color palette slides**: Horizontal swatch bars inside a torn paper card element, hex codes below each

---

## SLIDE TEMPLATES TO BUILD

These replace the current 29 templates. Each is a function that takes synthesis data and returns HTML/CSS (maintaining the existing Puppeteer→PNG rendering pipeline).

### Universal Templates (used in all deck types)

| # | Template Name | Layout | Description |
|---|--------------|--------|-------------|
| 1 | `titleSlide` | Centered | Artist name on masking tape, centered. Light background with paper texture + coffee stains. |
| 2 | `sectionDivider` | Centered | Section name on masking tape, dark background. Used between major sections. |
| 3 | `sectionDividerLight` | Centered | Section name on masking tape, light/paper background. |
| 4 | `manifestoSlide` | Text-only | Masking tape header "THE ARTIST" or custom title. 2-3 paragraphs of monospace body text on dark background. |
| 5 | `textAndCollage` | 40/60 split | Text on left (masking tape header + monospace body), 3-4 photos collaged on right with black tape. Dark bg. |
| 6 | `textAndCollageLarge` | 35/65 split | Same as above but one large hero image with 1-2 smaller. For when one reference is dominant. |
| 7 | `textAndCollageLight` | 40/60 split | Same layout on light/paper background. For contrast in slide sequence. |
| 8 | `fullImageGrid` | Grid | 4-6 images in asymmetric grid filling the slide. Minimal or no text. Dark bg. For mood boards / appendix. |
| 9 | `colorPaletteSlideDark` | Custom | Masking tape header + rationale text + 5 color swatches inside torn paper card element with hex codes. Dark bg. |
| 10 | `colorPaletteSlideLight` | Custom | Same as above on light/paper background. |
| 11 | `threeColumnFramework` | 3-col | Masking tape header + intro text + three torn paper cards in a row, each with title + description. For content pillars, strategy buckets. Light bg. |
| 12 | `threeColumnFrameworkDark` | 3-col | Same on dark/black background with white card outlines instead of paper texture. |
| 13 | `bulletListSlide` | Text-only | Masking tape header + bullet items. Monospace text. Dark bg. For specific direction lists. |
| 14 | `comparisonSlide` | 2-col | "Where We Are" / "Where We Can Go" split. Left side current state, right side aspirational. Each with supporting images. |
| 15 | `closingSlide` | Centered | Artist name on masking tape, "Thank You" in body font below. Light background. |

### Campaign Deck Templates (Type 1 additions)

| # | Template Name | Layout | Description |
|---|--------------|--------|-------------|
| 16 | `rolloutStrategy` | Custom | Masking tape header "ROLLOUT STRATEGY". Tiered acts (ACT I / ACT II / ACT III) with descriptions. Dark bg. |
| 17 | `videoOverview` | Text-heavy | Masking tape header "VIDEOS". Full paragraph explaining video rollout philosophy. Lists video types below. |
| 18 | `videoTreatment` | Text + stills | Song-specific video concept. Title at top, 1-2 paragraph treatment, reference stills arranged below or right. |
| 19 | `videoTreatmentGrid` | Grid | Reference stills for a specific video treatment. 6-12 images with small caption overlay. |
| 20 | `talentRecommendation` | Profile | Photographer/director name as header, 2-3 work samples, brief rationale. |

### Project Deck Templates (Type 2 additions)

| # | Template Name | Layout | Description |
|---|--------------|--------|-------------|
| 21 | `tocSlide` | Custom | Table of contents with section names. Monospace text. |
| 22 | `merchGrid` | Grid | Merch mockup images in 2x2 grid. Dark bg. |
| 23 | `logoGrid` | Grid | Logo variations in 2x2 grid. |
| 24 | `stageDesign` | Full-bleed | Stage/performance design reference with caption overlay. Dark bg. |

### Identity Bible Templates (Type 3 additions)

| # | Template Name | Layout | Description |
|---|--------------|--------|-------------|
| 25 | `aestheticFormula` | Custom | Masking tape header "AESTHETIC FORMULA". Intro text + three category labels on masking tape strips. Dark bg. |
| 26 | `stylingDuality` | 40/60 split | Text describing two sides of artist's style. Image collage showing both sides. Dark bg. |

---

## TEMPLATE IMPLEMENTATION

### Design Assets Needed

Before building templates, create or source these reusable assets:

1. **Masking tape texture** — PNG with transparency. Torn edges, slightly off-white. ~600x80px. Text rendered ON TOP via CSS.
2. **Paper texture** — Seamless tileable background. Off-white with subtle grain.
3. **Coffee stain marks** — 2-3 PNG overlays with transparency. Placed in corners of light-bg slides.
4. **Black tape strips** — Small rectangles (~60x15px) of black tape texture. Used at image corners.
5. **Torn paper card** — PNG with transparency for framework card elements. ~400x500px with torn/ragged edges.

**If assets aren't available**: Use CSS approximations:
- Masking tape: light gray rectangle with `clip-path` for rough edges
- Paper texture: CSS gradient with noise filter
- Tape strips: simple black rectangles with slight rotation
- Torn paper: white rectangles with box-shadow and subtle border irregularity

### HTML/CSS Template Pattern

Each template function follows this signature (matching existing codebase pattern):

```typescript
interface SlideData {
  // From MoodBoardAnalysis synthesis
  artistName: string;
  manifesto: string;
  extendedNarrative: string;
  colorPalette: { hex: string; weight: number; name?: string }[];
  colorRationale: string;
  aestheticTags: { tag: string; weight: number }[];
  moodTags: { tag: string; weight: number }[];
  energy: number; // 0-1

  // Touchpoint directions (from synthesis)
  touchpoints: Record<string, string>; // category → direction text

  // Content framework (AI-generated)
  contentPillars?: { title: string; subtitle: string; traits: string[] }[];

  // Rollout strategy (AI-generated)
  rolloutActs?: { title: string; description: string }[];

  // Video treatments (AI-generated)
  videoTreatments?: { songTitle: string; concept: string; references?: string[] }[];

  // Images
  moodBoardImages: string[]; // base64 or file paths
  starredImages: string[]; // user-favorited hero images
  generatedImages: Record<string, string[]>; // section → generated image paths
  artistPhotos: string[]; // uploaded photos of the artist

  // Graph data (if available)
  talentRecommendations?: {
    name: string;
    type: string;
    rationale: string;
    sampleWorkUrls?: string[];
  }[];

  // Styling
  stylingDirection?: string;
  stylingDuality?: { sideA: string; sideB: string; synthesis: string };

  // Photography
  photographyAssessment?: { current: string; future: string };
}

type TemplateFunction = (data: SlideData) => string;
```

### Rendering Pipeline (keep existing)
```
SlideData → template functions → HTML strings → Puppeteer → 1920x1080 PNGs → pdf-lib → PDF
```

---

## ASSEMBLY LOGIC

### New Assembler

```typescript
type DeckType = 'campaign' | 'project' | 'identity';

function assembleSmartDeck(data: SlideData, deckType: DeckType): string[] {
  const slides: string[] = [];
  slides.push(titleSlide(data));
  slides.push(manifestoSlide(data));

  if (deckType === 'campaign') {
    return assembleCampaignDeck(data, slides);
  } else if (deckType === 'project') {
    return assembleProjectDeck(data, slides);
  } else {
    return assembleIdentityBible(data, slides);
  }
}
```

### Campaign Deck Assembly (~30-40 slides)
### Project Deck Assembly (~45-60 slides)
### Identity Bible Assembly (~18-25 slides)

(Full assembly sequences defined in the spec message above)

---

## AI WRITING QUALITY TIERS

### Tier 1: AI generates well (70-90% quality)
- Color palette hex codes + names
- Color rationale paragraph
- Aesthetic tag extraction
- Content pillar frameworks
- Photography technical direction

### Tier 2: AI generates okay (40-60% quality)
- Artist manifesto
- Styling direction paragraphs
- Rollout strategy structure
- Section introductions

### Tier 3: AI generates poorly (below 40%)
- Video treatments (labeled as "STARTING POINT")
- Specific talent names (placeholders)
- Design-specific cultural direction

### Writing Style Prompt
```
Write in a creative direction voice. Short sentences. Declarative. No corporate filler.
Specific and tactile — name textures, materials, lighting conditions, not abstract feelings.
Use tension and contrast: "old leather against new steel" not "classic meets modern."
Never use: "elevate," "leverage," "synergy," "cutting-edge," "world-class," "innovative."
Read like someone who's directed 50 campaigns, not someone describing their first mood board.
Monospace-friendly — text will be rendered in a typewriter font, so write accordingly.
Short paragraphs. 2-4 sentences max. Let the images carry the rest.
```

---

## ACCEPTANCE CRITERIA

- [ ] Each template renders at 1920x1080 without overflow
- [ ] Masking tape headers on all section dividers
- [ ] Photo collages with black tape corners
- [ ] Light/dark slides alternate correctly
- [ ] Monospace font for all body text
- [ ] Campaign deck: 25-40 slides
- [ ] Project deck: 40-60 slides
- [ ] Identity bible: 15-25 slides
- [ ] Generated images routed to correct sections
- [ ] No corporate filler in generated text
- [ ] Full pipeline: upload → analyze → deck → PDF
- [ ] PDF under 30MB
- [ ] PPTX export still works

---

## BUILD ORDER

1. Create `theme.ts` — shared CSS foundation
2. Create/source design assets (or CSS approximations)
3. Build universal templates (1-15)
4. Build Identity Bible assembly (smallest, fastest to test)
5. Update synthesis prompt for new fields
6. Build Campaign Deck assembly + templates (16-20)
7. Build Project Deck assembly + templates (21-24)
8. Build Identity Bible templates (25-26)
9. Test end-to-end with real campaign data
10. Iterate on writing quality
