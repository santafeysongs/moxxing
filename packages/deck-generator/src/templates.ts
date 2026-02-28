/**
 * Deck Templates — 26 slide templates for Culture & Context
 * 
 * Design language: Masking tape headers, typewriter body text,
 * photo collages with black tape, alternating light/dark slides.
 */

import {
  COLORS, FONTS, baseStyles, paperTextureBg, coffeeStains,
  maskingTape, blackTapeStrip, collagPhoto, tornPaperCard,
  bodyTextStyle, darkSlide, lightSlide, blackSlide,
} from './theme';

// ── TYPES ───────────────────────────────────────────

export interface SlideData {
  artistName: string;
  manifesto: string;
  extendedNarrative: string;
  colorPalette: { hex: string; weight: number; name?: string }[];
  colorRationale: string;
  aestheticTags: { tag: string; weight: number }[];
  moodTags: { tag: string; weight: number }[];
  energy: number;

  touchpoints: Record<string, string>;

  contentPillars?: { title: string; subtitle: string; traits: string[] }[];
  rolloutActs?: { title: string; description: string }[];
  videoTreatments?: { songTitle: string; concept: string; references?: string[] }[];

  moodBoardImages: string[];
  starredImages: string[];
  generatedImages: Record<string, string[]>;
  artistPhotos: string[];

  talentRecommendations?: {
    name: string;
    type: string;
    rationale: string;
    sampleWorkUrls?: string[];
  }[];

  stylingDirection?: string;
  stylingDuality?: { sideA: string; sideB: string; synthesis: string };
  photographyAssessment?: { current: string; future: string };

  productSection?: {
    overviewNarrative: string;
    items: {
      name: string;
      category: string;
      description: string;
      colorway: string;
      keyDetail: string;
      isHeroItem: boolean;
      priceRange?: string;
    }[];
  };
}

export type DeckType = 'campaign' | 'project' | 'identity';

// ── HELPERS ─────────────────────────────────────────

function pickImages(images: string[], count: number, offset = 0): string[] {
  if (!images.length) return [];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(images[(i + offset) % images.length]);
  }
  return result;
}

function genImgs(data: SlideData, section: string): string[] {
  return data.generatedImages?.[section] || [];
}

// Match a product item to its generated image by keyword in category name
function findProductImage(data: SlideData, itemName: string, itemCategory: string): string | null {
  // The raw generated images have categories like 'product-tee', 'product-hoodie', 'product-poster'
  // Try to match based on keywords
  const allProductImgs = data.generatedImages?.['product'] || [];
  if (!allProductImgs.length) return null;

  // Access raw generated image data if available
  const rawImages = (data as any)._rawGeneratedImages as Array<{ category: string; base64: string }> | undefined;
  if (rawImages) {
    const searchTerms = `${itemName} ${itemCategory}`.toLowerCase();
    for (const img of rawImages) {
      if (img.category.startsWith('product-')) {
        const imgType = img.category.replace('product-', '');
        if (searchTerms.includes(imgType) || imgType.includes(searchTerms.split(' ')[0])) {
          return `data:image/png;base64,${img.base64}`;
        }
      }
    }
  }
  return null;
}

function allImages(data: SlideData): string[] {
  return [...data.starredImages, ...data.moodBoardImages];
}

// ════════════════════════════════════════════════════
// UNIVERSAL TEMPLATES (1-15)
// ════════════════════════════════════════════════════

// ── 1: TITLE SLIDE ──────────────────────────────────

export function heroSlide(data: SlideData, heroImage: string): string {
  return darkSlide(`
    <div style="position: relative; width: 100%; height: 100%; overflow: hidden;">
      <img src="${heroImage}" style="
        width: 100%; height: 100%; object-fit: cover;
        position: absolute; inset: 0;
      " />
      <div style="
        position: absolute; bottom: 0; left: 0; right: 0;
        background: linear-gradient(transparent, rgba(0,0,0,0.85));
        padding: 60px 80px 50px;
      ">
        <div style="
          font-family: ${FONTS.display}; font-size: 3.5rem;
          color: #fff; font-weight: 800; line-height: 1;
          letter-spacing: -0.01em;
        ">${data.artistName.toUpperCase()}</div>
        <div style="
          font-family: ${FONTS.body}; font-size: 0.85rem;
          color: rgba(255,255,255,0.5); letter-spacing: 0.2em;
          text-transform: uppercase; margin-top: 12px;
        ">creative direction</div>
      </div>
    </div>
  `);
}

export function titleSlide(data: SlideData): string {
  return lightSlide(`
    <div style="
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
      flex-direction: column; gap: 32px;
    ">
      ${maskingTape(data.artistName, { fontSize: '4rem' })}
      <div style="
        font-family: ${FONTS.body};
        font-size: 0.9rem;
        color: ${COLORS.inkLight};
        letter-spacing: 0.25em;
        text-transform: uppercase;
        margin-top: 8px;
      ">creative direction</div>
    </div>
  `);
}

// ── 2: SECTION DIVIDER (dark) ───────────────────────

export function sectionDivider(data: SlideData, sectionName: string): string {
  return darkSlide(`
    <div style="
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
    ">
      <div style="
        font-family: ${FONTS.display}; font-size: 3.2rem; font-weight: 900;
        color: #fff; text-transform: uppercase; letter-spacing: 0.06em;
      ">${sectionName}</div>
    </div>
  `);
}

// ── 3: SECTION DIVIDER (light) ──────────────────────

export function sectionDividerLight(data: SlideData, sectionName: string): string {
  return lightSlide(`
    <div style="
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
    ">
      <div style="
        font-family: ${FONTS.display}; font-size: 3.2rem; font-weight: 900;
        color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.06em;
      ">${sectionName}</div>
    </div>
  `);
}

// ── 4: MANIFESTO SLIDE ──────────────────────────────

export function manifestoSlide(data: SlideData, title?: string): string {
  // Trim manifesto to 2-3 sentences max — show don't tell
  const trimText = (text: string, maxSentences: number) => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, maxSentences).join(' ').trim();
  };
  const manifesto = trimText(data.manifesto, 3);
  const narrative = trimText(data.extendedNarrative, 2);

  return darkSlide(`
    <div style="padding: 100px 120px;">
      <div style="margin-bottom: 48px;">
        <div style="
          font-family: ${FONTS.display}; font-size: 2.4rem; font-weight: 900;
          color: #fff; text-transform: uppercase; letter-spacing: 0.04em;
        ">${title || data.artistName.toUpperCase()}</div>
      </div>
      <div style="
        font-family: ${FONTS.body}; color: rgba(255,255,255,0.85);
        max-width: 1200px; font-size: 1.15rem; line-height: 1.85;
      ">
        <p style="margin-bottom: 24px;">${manifesto}</p>
        ${narrative && narrative !== manifesto ? `<p style="color: rgba(255,255,255,0.5);">${narrative}</p>` : ''}
      </div>
    </div>
  `);
}

// ── 5: TEXT AND COLLAGE (dark) ──────────────────────

export function textAndCollage(
  data: SlideData,
  opts: { title: string; body: string; images: string[] }
): string {
  const imgs = opts.images.slice(0, 4);
  const cols = imgs.length <= 1 ? 1 : 2;
  const rows = imgs.length <= 2 ? 1 : 2;

  return darkSlide(`
    <div style="display: flex; height: 100%;">
      <div style="width: 40%; padding: 80px 60px 80px 100px; display: flex; flex-direction: column; justify-content: center;">
        <div style="
          font-family: ${FONTS.display}; font-size: 2rem; font-weight: 900;
          color: #fff; text-transform: uppercase; letter-spacing: 0.04em;
          margin-bottom: 36px;
        ">${opts.title}</div>
        <div style="font-family: ${FONTS.body}; color: rgba(255,255,255,0.8); font-size: 1rem; line-height: 1.8;">
          ${opts.body}
        </div>
      </div>
      <div style="width: 60%; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: 2px;">
        ${imgs.map(src => `<div style="overflow:hidden;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`).join('')}
      </div>
    </div>
  `);
}

// ── 6: TEXT AND COLLAGE LARGE (dark) ────────────────

export function textAndCollageLarge(
  data: SlideData,
  opts: { title: string; body: string; images: string[] }
): string {
  const imgs = opts.images.slice(0, 3);

  return darkSlide(`
    <div style="display: flex; height: 100%;">
      <div style="width: 35%; padding: 80px 60px 80px 100px; display: flex; flex-direction: column; justify-content: center;">
        <div style="
          font-family: ${FONTS.display}; font-size: 2rem; font-weight: 900;
          color: #fff; text-transform: uppercase; letter-spacing: 0.04em;
          margin-bottom: 36px;
        ">${opts.title}</div>
        <div style="font-family: ${FONTS.body}; color: rgba(255,255,255,0.8); font-size: 1rem; line-height: 1.8;">
          ${opts.body}
        </div>
      </div>
      <div style="width: 65%; display: grid; grid-template-columns: ${imgs.length === 1 ? '1fr' : 'repeat(2, 1fr)'}; grid-template-rows: ${imgs.length <= 2 ? '1fr' : 'repeat(2, 1fr)'}; gap: 2px;">
        ${imgs.map((src, i) => `<div style="overflow:hidden;${i === 0 && imgs.length === 3 ? 'grid-row: 1 / -1;' : ''}"><img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`).join('')}
      </div>
    </div>
  `);
}

// ── 7: TEXT AND COLLAGE (light) ─────────────────────

export function textAndCollageLight(
  data: SlideData,
  opts: { title: string; body: string; images: string[] }
): string {
  const imgs = opts.images.slice(0, 4);
  const layouts = [
    { w: '420px', h: '340px', top: '80px', right: '380px', rot: '-1.5deg', tape: ['tl', 'br'] as const },
    { w: '360px', h: '280px', top: '60px', right: '40px', rot: '2deg', tape: ['tr'] as const },
    { w: '380px', h: '300px', top: '440px', right: '340px', rot: '1deg', tape: ['bl', 'tr'] as const },
    { w: '320px', h: '260px', top: '480px', right: '20px', rot: '-2deg', tape: ['tl'] as const },
  ];

  return lightSlide(`
    <div style="padding: 80px 0 80px 100px; width: 40%;">
      <div style="
        font-family: ${FONTS.display}; font-size: 2rem; font-weight: 900;
        color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.04em;
        margin-bottom: 36px;
      ">${opts.title}</div>
      <div style="font-family: ${FONTS.body}; color: rgba(0,0,0,0.7); font-size: 1rem; line-height: 1.8;">
        ${opts.body}
      </div>
    </div>
    <div style="position: absolute; right: 0; top: 0; width: 60%; height: 100%; display: grid; grid-template-columns: repeat(${imgs.length <= 2 ? imgs.length : 2}, 1fr); grid-template-rows: repeat(${imgs.length <= 2 ? 1 : 2}, 1fr); gap: 2px;">
      ${imgs.map(src => `<div style="overflow:hidden;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`).join('')}
    </div>
  `);
}

// ── 8: FULL IMAGE GRID ──────────────────────────────

export function fullImageGrid(data: SlideData, images: string[], caption?: string): string {
  const imgs = images.slice(0, 6);
  const count = imgs.length;

  // Perfect grid: all boxes same size, aligned, justified
  // 1 image = full bleed, 2 = 50/50, 3 = row of 3, 4 = 2×2, 5-6 = 3×2
  const cols = count <= 1 ? 1 : count <= 2 ? 2 : 3;
  const rows = count <= 3 ? 1 : 2;

  return darkSlide(`
    <div style="
      position: absolute; inset: 0;
      display: grid;
      grid-template-columns: repeat(${cols}, 1fr);
      grid-template-rows: repeat(${rows}, 1fr);
      gap: 2px;
    ">
      ${imgs.map(src => `
        <div style="overflow: hidden;">
          <img src="${src}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
        </div>
      `).join('')}
    </div>
    ${caption ? `<div style="
      position: absolute; bottom: 16px; right: 20px; z-index: 20;
      font-family: ${FONTS.body}; font-size: 0.7rem;
      color: rgba(255,255,255,0.4); letter-spacing: 0.1em;
      text-transform: uppercase;
    ">${caption}</div>` : ''}
  `);
}

// ── 9: COLOR PALETTE (dark) ─────────────────────────

export function colorPaletteSlideDark(data: SlideData): string {
  const palette = data.colorPalette.slice(0, 6);

  const swatches = palette.map(c => `
    <div style="flex: ${c.weight || 1}; display: flex; flex-direction: column; align-items: center;">
      <div style="
        width: 100%; height: 100px;
        background: ${c.hex};
        border-radius: 2px;
      "></div>
      <div style="
        font-family: ${FONTS.mono}; font-size: 0.7rem;
        color: ${COLORS.creamDim}; margin-top: 12px;
        letter-spacing: 0.08em;
      ">${c.hex}</div>
      ${c.name ? `<div style="
        font-family: ${FONTS.body}; font-size: 0.65rem;
        color: ${COLORS.creamDim}; opacity: 0.6; margin-top: 4px;
      ">${c.name}</div>` : ''}
    </div>
  `).join('');

  return darkSlide(`
    <div style="padding: 100px 120px;">
      <div style="
        font-family: ${FONTS.display}; font-size: 2.4rem; font-weight: 900;
        color: #fff; text-transform: uppercase; letter-spacing: 0.04em;
        margin-bottom: 48px;
      ">COLOR PALETTE</div>
      <div style="font-family: ${FONTS.body}; color: rgba(255,255,255,0.7); max-width: 900px; margin-bottom: 48px; line-height: 1.7;">
        ${data.colorRationale}
      </div>
      <div style="display: flex; gap: 24px;">
        ${swatches}
      </div>
    </div>
  `);
}

// ── 10: COLOR PALETTE (light) ───────────────────────

export function colorPaletteSlideLight(data: SlideData): string {
  const palette = data.colorPalette.slice(0, 6);

  const swatches = palette.map(c => `
    <div style="flex: ${c.weight || 1}; display: flex; flex-direction: column; align-items: center;">
      <div style="
        width: 100%; height: 100px;
        background: ${c.hex};
        border-radius: 2px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      "></div>
      <div style="
        font-family: ${FONTS.mono}; font-size: 0.7rem;
        color: ${COLORS.inkMedium}; margin-top: 12px;
        letter-spacing: 0.08em;
      ">${c.hex}</div>
      ${c.name ? `<div style="
        font-family: ${FONTS.body}; font-size: 0.65rem;
        color: ${COLORS.inkLight}; margin-top: 4px;
      ">${c.name}</div>` : ''}
    </div>
  `).join('');

  return lightSlide(`
    <div style="padding: 100px 120px;">
      <div style="
        font-family: ${FONTS.display}; font-size: 2.4rem; font-weight: 900;
        color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.04em;
        margin-bottom: 48px;
      ">COLOR PALETTE</div>
      <div style="font-family: ${FONTS.body}; color: rgba(0,0,0,0.6); max-width: 900px; margin-bottom: 48px; line-height: 1.7;">
        ${data.colorRationale}
      </div>
      <div style="display: flex; gap: 24px;">
        ${swatches}
      </div>
    </div>
  `);
}

// ── 11: THREE COLUMN FRAMEWORK (light) ──────────────

export function threeColumnFramework(
  data: SlideData,
  opts: { title: string; intro?: string; columns: { title: string; subtitle: string; items: string[] }[] }
): string {
  const cols = opts.columns.slice(0, 3);

  return lightSlide(`
    <div style="padding: 80px 100px;">
      <div style="margin-bottom: 24px;">
        ${maskingTape(opts.title, { fontSize: '2.2rem' })}
      </div>
      ${opts.intro ? `<div style="
        ${bodyTextStyle(COLORS.inkDark)}
        max-width: 1000px; margin-bottom: 40px; font-size: 0.95rem;
      ">${opts.intro}</div>` : ''}
      <div style="display: flex; gap: 40px; margin-top: 20px;">
        ${cols.map(col => tornPaperCard(`
          <div style="text-align: center;">
            <div style="
              display: inline-block; margin-bottom: 16px;
            ">${maskingTape(col.title, { fontSize: '1.3rem' })}</div>
            <div style="
              font-family: ${FONTS.body}; font-size: 0.85rem;
              color: ${COLORS.inkMedium}; margin-bottom: 20px;
              font-style: italic;
            ">${col.subtitle}</div>
            <div style="
              font-family: ${FONTS.body}; font-size: 0.8rem;
              color: ${COLORS.inkDark}; line-height: 2;
              text-align: left; padding: 0 8px;
            ">
              ${col.items.map(item => `• ${item}`).join('<br>')}
            </div>
          </div>
        `, { width: '100%' })).join('')}
      </div>
    </div>
  `);
}

// ── 12: THREE COLUMN FRAMEWORK (dark) ───────────────

export function threeColumnFrameworkDark(
  data: SlideData,
  opts: { title: string; intro?: string; columns: { title: string; subtitle: string; items: string[] }[] }
): string {
  const cols = opts.columns.slice(0, 3);

  return blackSlide(`
    <div style="padding: 80px 100px;">
      <div style="margin-bottom: 24px;">
        ${maskingTape(opts.title, { fontSize: '2.2rem' })}
      </div>
      ${opts.intro ? `<div style="
        ${bodyTextStyle()}
        max-width: 1000px; margin-bottom: 40px; font-size: 0.95rem;
      ">${opts.intro}</div>` : ''}
      <div style="display: flex; gap: 40px; margin-top: 20px;">
        ${cols.map(col => `
          <div style="
            flex: 1;
            border: 1px solid rgba(255,255,255,0.15);
            padding: 36px 28px;
          ">
            <div style="text-align: center;">
              <div style="
                font-family: ${FONTS.header}; font-size: 1.4rem;
                color: ${COLORS.white}; text-transform: uppercase;
                letter-spacing: 0.08em; margin-bottom: 12px;
              ">${col.title}</div>
              <div style="
                font-family: ${FONTS.body}; font-size: 0.85rem;
                color: ${COLORS.whiteDim}; margin-bottom: 20px;
                font-style: italic;
              ">${col.subtitle}</div>
              <div style="
                font-family: ${FONTS.body}; font-size: 0.8rem;
                color: ${COLORS.white}; line-height: 2;
                text-align: left; padding: 0 8px;
              ">
                ${col.items.map(item => `• ${item}`).join('<br>')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 13: BULLET LIST SLIDE ───────────────────────────

export function bulletListSlide(
  data: SlideData,
  opts: { title: string; items: string[] }
): string {
  return darkSlide(`
    <div style="padding: 100px 120px;">
      <div style="margin-bottom: 48px;">
        ${maskingTape(opts.title, { fontSize: '2.2rem' })}
      </div>
      <div style="
        ${bodyTextStyle()}
        font-size: 1.05rem; line-height: 2.2;
        max-width: 1200px;
      ">
        ${opts.items.map(item => `
          <div style="display: flex; align-items: baseline; gap: 16px; margin-bottom: 8px;">
            <span style="color: ${COLORS.creamDim}; font-size: 0.7rem;">▪</span>
            <span>${item}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 14: COMPARISON SLIDE ────────────────────────────

export function comparisonSlide(
  data: SlideData,
  opts: { leftTitle: string; leftBody: string; leftImages: string[]; rightTitle: string; rightBody: string; rightImages: string[] }
): string {
  return darkSlide(`
    <div style="display: flex; height: 100%;">
      <div style="flex: 1; padding: 80px 60px; border-right: 1px solid rgba(255,255,255,0.08);">
        <div style="margin-bottom: 28px;">
          ${maskingTape(opts.leftTitle, { fontSize: '1.6rem' })}
        </div>
        <div style="${bodyTextStyle()} font-size: 0.95rem; margin-bottom: 32px;">
          ${opts.leftBody}
        </div>
        <div style="position: relative; height: 500px;">
          ${opts.leftImages.slice(0, 2).map((src, i) => collagPhoto(src, {
            width: i === 0 ? '380px' : '300px',
            height: i === 0 ? '320px' : '250px',
            top: i === 0 ? '0' : '260px',
            left: i === 0 ? '0' : '200px',
            rotation: i === 0 ? '-1deg' : '2deg',
            zIndex: i + 1,
            tape: i === 0 ? ['tl', 'br'] : ['tr'],
          })).join('')}
        </div>
      </div>
      <div style="flex: 1; padding: 80px 60px;">
        <div style="margin-bottom: 28px;">
          ${maskingTape(opts.rightTitle, { fontSize: '1.6rem' })}
        </div>
        <div style="${bodyTextStyle()} font-size: 0.95rem; margin-bottom: 32px;">
          ${opts.rightBody}
        </div>
        <div style="position: relative; height: 500px;">
          ${opts.rightImages.slice(0, 2).map((src, i) => collagPhoto(src, {
            width: i === 0 ? '380px' : '300px',
            height: i === 0 ? '320px' : '250px',
            top: i === 0 ? '0' : '260px',
            left: i === 0 ? '0' : '200px',
            rotation: i === 0 ? '1.5deg' : '-1deg',
            zIndex: i + 1,
            tape: i === 0 ? ['tr', 'bl'] : ['tl'],
          })).join('')}
        </div>
      </div>
    </div>
  `);
}

// ── 15: CLOSING SLIDE ───────────────────────────────

export function closingSlide(data: SlideData): string {
  return lightSlide(`
    <div style="
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
      flex-direction: column; gap: 40px;
    ">
      ${maskingTape(data.artistName, { fontSize: '3.6rem' })}
      <div style="
        font-family: ${FONTS.body};
        font-size: 1rem;
        color: ${COLORS.inkLight};
        letter-spacing: 0.15em;
        text-transform: lowercase;
      ">thank you</div>
    </div>
  `);
}


// ════════════════════════════════════════════════════
// CAMPAIGN DECK TEMPLATES (16-20)
// ════════════════════════════════════════════════════

// ── 16: ROLLOUT STRATEGY ────────────────────────────

export function rolloutStrategy(data: SlideData): string {
  const acts = data.rolloutActs || [];

  return darkSlide(`
    <div style="padding: 80px 120px;">
      <div style="margin-bottom: 56px;">
        ${maskingTape('ROLLOUT STRATEGY', { fontSize: '2.4rem' })}
      </div>
      <div style="display: flex; flex-direction: column; gap: 40px;">
        ${acts.map((act, i) => `
          <div style="display: flex; gap: 32px; align-items: flex-start;">
            <div style="
              min-width: 200px;
            ">${maskingTape(act.title, { fontSize: '1.4rem' })}</div>
            <div style="
              ${bodyTextStyle()}
              font-size: 1rem; line-height: 1.8;
              padding-top: 8px;
              border-left: 2px solid rgba(255,255,255,0.1);
              padding-left: 28px;
            ">${act.description}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 17: VIDEO OVERVIEW ──────────────────────────────

export function videoOverview(data: SlideData): string {
  const videoDir = data.touchpoints?.music_video || data.touchpoints?.short_form_video || '';

  return darkSlide(`
    <div style="padding: 80px 120px;">
      <div style="margin-bottom: 48px;">
        ${maskingTape('VIDEOS', { fontSize: '2.4rem' })}
      </div>
      <div style="
        ${bodyTextStyle()}
        font-size: 1.1rem; line-height: 1.85;
        max-width: 1100px; margin-bottom: 48px;
      ">${videoDir}</div>
      <div style="
        display: flex; gap: 24px; flex-wrap: wrap;
      ">
        ${['album trailer', 'performance videos', 'narrative videos', 'short form / vertical', 'visualizers', 'behind the scenes'].map(type => `
          <div style="
            padding: 10px 20px;
            border: 1px solid rgba(255,255,255,0.15);
            font-family: ${FONTS.body};
            font-size: 0.8rem;
            color: ${COLORS.creamDim};
            letter-spacing: 0.05em;
          ">${type}</div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 18: VIDEO TREATMENT ─────────────────────────────

export function videoTreatment(
  data: SlideData,
  treatment: { songTitle: string; concept: string },
  referenceImages: string[]
): string {
  const imgs = referenceImages.slice(0, 3);

  return darkSlide(`
    <div style="padding: 80px 0 80px 100px; width: 42%;">
      <div style="margin-bottom: 12px;">
        <div style="
          font-family: ${FONTS.body}; font-size: 0.75rem;
          color: ${COLORS.creamDim}; letter-spacing: 0.15em;
          text-transform: uppercase; margin-bottom: 12px;
        ">video treatment — starting point</div>
        ${maskingTape(treatment.songTitle, { fontSize: '2rem' })}
      </div>
      <div style="
        ${bodyTextStyle()}
        font-size: 1rem; line-height: 1.85;
        margin-top: 32px;
      ">${treatment.concept}</div>
    </div>
    <div style="position: absolute; right: 0; top: 0; width: 55%; height: 100%;">
      ${imgs[0] ? collagPhoto(imgs[0], {
        width: '520px', height: '420px', top: '80px', right: '80px',
        rotation: '-1deg', zIndex: 2, tape: ['tl', 'br'],
      }) : ''}
      ${imgs[1] ? collagPhoto(imgs[1], {
        width: '300px', height: '240px', top: '520px', right: '400px',
        rotation: '2deg', zIndex: 3, tape: ['tr'],
      }) : ''}
      ${imgs[2] ? collagPhoto(imgs[2], {
        width: '340px', height: '280px', top: '540px', right: '60px',
        rotation: '-1.5deg', zIndex: 3, tape: ['bl'],
      }) : ''}
    </div>
  `);
}

// ── 19: VIDEO TREATMENT GRID ────────────────────────

export function videoTreatmentGrid(
  songTitle: string,
  images: string[]
): string {
  const imgs = images.slice(0, 9);
  const cols = 3;
  const cellW = 580;
  const cellH = 460;
  const gap = 20;
  const startX = 40;
  const startY = 100;

  return darkSlide(`
    <div style="
      position: absolute; top: 30px; left: 40px;
      font-family: ${FONTS.body}; font-size: 0.7rem;
      color: ${COLORS.creamDim}; letter-spacing: 0.12em;
      text-transform: uppercase;
    ">${songTitle} — visual references</div>
    ${imgs.map((src, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * (cellW + gap);
      const y = startY + row * (cellH + gap);
      return collagPhoto(src, {
        width: `${cellW}px`, height: `${cellH}px`,
        top: `${y}px`, left: `${x}px`,
        rotation: `${-1 + Math.random() * 2}deg`,
        zIndex: i + 1,
        tape: i % 3 === 0 ? ['tl'] : i % 3 === 1 ? ['tr'] : ['br'],
      });
    }).join('')}
  `);
}

// ── 20: TALENT RECOMMENDATION ───────────────────────

export function talentRecommendation(
  data: SlideData,
  talent: { name: string; type: string; rationale: string; sampleWorkUrls?: string[] }
): string {
  const samples = talent.sampleWorkUrls || [];

  return darkSlide(`
    <div style="padding: 80px 100px; width: 40%;">
      <div style="
        font-family: ${FONTS.body}; font-size: 0.75rem;
        color: ${COLORS.creamDim}; letter-spacing: 0.15em;
        text-transform: uppercase; margin-bottom: 16px;
      ">recommended ${talent.type.toLowerCase()}</div>
      <div style="margin-bottom: 32px;">
        ${maskingTape(talent.name, { fontSize: '2.2rem' })}
      </div>
      <div style="
        ${bodyTextStyle()}
        font-size: 1rem; line-height: 1.85;
      ">${talent.rationale}</div>
    </div>
    <div style="position: absolute; right: 0; top: 0; width: 58%; height: 100%;">
      ${samples.slice(0, 3).map((src, i) => collagPhoto(src, {
        width: i === 0 ? '480px' : '320px',
        height: i === 0 ? '400px' : '260px',
        top: i === 0 ? '100px' : i === 1 ? '520px' : '560px',
        right: i === 0 ? '200px' : i === 1 ? '500px' : '80px',
        rotation: `${-2 + i * 1.5}deg`,
        zIndex: i + 1,
        tape: ['tl', 'br'],
      })).join('')}
    </div>
  `);
}


// ════════════════════════════════════════════════════
// PROJECT DECK TEMPLATES (21-24)
// ════════════════════════════════════════════════════

// ── 21: TABLE OF CONTENTS ───────────────────────────

export function tocSlide(data: SlideData, sections: string[]): string {
  return darkSlide(`
    <div style="padding: 100px 160px;">
      <div style="margin-bottom: 56px;">
        ${maskingTape('TABLE OF CONTENTS', { fontSize: '2rem' })}
      </div>
      <div style="
        font-family: ${FONTS.body};
        font-size: 1.1rem;
        line-height: 2.4;
        color: ${COLORS.cream};
      ">
        ${sections.map((s, i) => `
          <div style="display: flex; align-items: baseline; gap: 16px;">
            <span style="
              font-family: ${FONTS.mono}; font-size: 0.8rem;
              color: ${COLORS.creamDim}; min-width: 32px;
            ">${String(i + 1).padStart(2, '0')}</span>
            <span style="text-transform: uppercase; letter-spacing: 0.06em;">${s}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 22: PRODUCT GRID (AI images + structured merch data) ──

export function productGrid(data: SlideData): string {
  const imgs = genImgs(data, 'product').slice(0, 4);
  const items = data.productSection?.items || [];

  // If we have structured merch data, use item names as labels
  const labels = items.length > 0
    ? items.slice(0, 4).map(i => i.name)
    : ['t-shirt', 'hoodie', 'poster', 'accessories'];

  return darkSlide(`
    <div style="
      position: absolute; top: 30px; left: 60px;
      font-family: ${FONTS.body}; font-size: 0.7rem;
      color: ${COLORS.creamDim}; letter-spacing: 0.12em;
      text-transform: uppercase;
    ">product design</div>
    <div style="
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 24px; padding: 100px 80px 60px;
      height: 100%;
    ">
      ${imgs.map((src, i) => `
        <div style="position: relative; overflow: hidden;">
          <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;" />
          <div style="
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 20px 16px; background: linear-gradient(transparent 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.9) 100%);
          ">
            <div style="
              font-family: ${FONTS.display}; font-size: 0.65rem;
              color: ${COLORS.white}; letter-spacing: 0.08em;
              text-transform: uppercase; font-weight: 700;
            ">${labels[i] || ''}</div>
            ${items[i]?.colorway ? `<div style="
              font-family: ${FONTS.body}; font-size: 0.5rem;
              color: ${COLORS.creamDim}; margin-top: 4px;
            ">${items[i].colorway}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

/** Merch detail slides — shows the full creative direction for each item */
export function productDetailSlides(data: SlideData): string[] {
  const items = data.productSection?.items || [];
  if (items.length === 0) return [];

  const slides: string[] = [];

  // Overview slide with narrative + all items listed
  const overview = data.productSection?.overviewNarrative || '';
  const heroItem = items.find(i => i.isHeroItem);

  slides.push(darkSlide(`
    <div style="padding: 60px 80px;">
      <div style="
        font-family: ${FONTS.display}; font-size: 0.65rem;
        color: ${COLORS.creamDim}; letter-spacing: 0.12em;
        text-transform: uppercase; margin-bottom: 24px;
      ">product direction</div>
      ${overview ? `<div style="
        font-family: ${FONTS.body}; font-size: 1rem;
        color: ${COLORS.cream}; line-height: 1.6;
        max-width: 800px; margin-bottom: 40px;
      ">${overview}</div>` : ''}
      <div style="
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 20px;
      ">
        ${items.map(item => `
          <div style="
            border-left: 3px solid ${item.isHeroItem ? COLORS.accent || '#ff4444' : COLORS.creamDim};
            padding: 12px 16px;
          ">
            <div style="
              font-family: ${FONTS.display}; font-size: 0.75rem;
              color: ${COLORS.white}; font-weight: 700;
              text-transform: uppercase; letter-spacing: 0.05em;
            ">${item.isHeroItem ? '★ ' : ''}${item.name}</div>
            <div style="
              font-family: ${FONTS.body}; font-size: 0.55rem;
              color: ${COLORS.creamDim}; margin-top: 4px;
              text-transform: uppercase; letter-spacing: 0.08em;
            ">${item.category} · ${item.priceRange || 'mid'}</div>
            <div style="
              font-family: ${FONTS.body}; font-size: 0.6rem;
              color: ${COLORS.cream}; margin-top: 6px; line-height: 1.4;
            ">${item.colorway}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `));

  // Hero item detail slide
  if (heroItem) {
    const heroImg = findProductImage(data, heroItem.name, heroItem.category) || genImgs(data, 'product')[0] || '';
    slides.push(darkSlide(`
      <div style="display: flex; height: 100%;">
        ${heroImg ? `<div style="flex: 1; overflow: hidden;">
          <img src="${heroImg}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>` : ''}
        <div style="flex: 1; padding: 60px 50px; display: flex; flex-direction: column; justify-content: center;">
          <div style="
            font-family: ${FONTS.body}; font-size: 0.6rem;
            color: ${COLORS.creamDim}; letter-spacing: 0.12em;
            text-transform: uppercase; margin-bottom: 8px;
          ">★ hero item</div>
          <div style="
            font-family: ${FONTS.display}; font-size: 1.5rem;
            color: ${COLORS.white}; font-weight: 800;
            text-transform: uppercase; line-height: 1.1;
            margin-bottom: 20px;
          ">${heroItem.name}</div>
          <div style="
            font-family: ${FONTS.body}; font-size: 0.8rem;
            color: ${COLORS.cream}; line-height: 1.6;
            margin-bottom: 24px;
          ">${heroItem.description}</div>
          <div style="
            font-family: ${FONTS.body}; font-size: 0.65rem;
            color: ${COLORS.creamDim}; line-height: 1.5;
          ">
            <div style="margin-bottom: 8px;"><strong style="color:${COLORS.white}">COLORWAY:</strong> ${heroItem.colorway}</div>
            <div><strong style="color:${COLORS.white}">KEY DETAIL:</strong> ${heroItem.keyDetail}</div>
          </div>
        </div>
      </div>
    `));
  }

  // Remaining items detail slide (grouped, 3 per slide)
  const nonHero = items.filter(i => !i.isHeroItem);
  const merchImgs = genImgs(data, 'product');
  for (let i = 0; i < nonHero.length; i += 3) {
    const batch = nonHero.slice(i, i + 3);

    slides.push(darkSlide(`
      <div style="padding: 60px 80px;">
        <div style="
          font-family: ${FONTS.display}; font-size: 0.65rem;
          color: ${COLORS.creamDim}; letter-spacing: 0.12em;
          text-transform: uppercase; margin-bottom: 32px;
        ">product details ${nonHero.length > 3 ? `(${Math.floor(i/3) + 1}/${Math.ceil(nonHero.length/3)})` : ''}</div>
        <div style="display: flex; flex-direction: column; gap: 28px;">
          ${batch.map((item, j) => {
            // Match product image by keyword in item name/category
            const matchedImg = findProductImage(data, item.name, item.category);
            const globalIdx = i + j + 1;
            const imgSrc = matchedImg || merchImgs[globalIdx % (merchImgs.length || 1)] || '';
            return `
            <div style="display: flex; gap: 24px; align-items: flex-start;">
              ${imgSrc ? `<img src="${imgSrc}" style="width: 140px; height: 140px; object-fit: cover; flex-shrink: 0;" />` : ''}
              <div style="flex: 1;">
                <div style="
                  font-family: ${FONTS.display}; font-size: 0.8rem;
                  color: ${COLORS.white}; font-weight: 700;
                  text-transform: uppercase;
                ">${item.name}</div>
                <div style="
                  font-family: ${FONTS.body}; font-size: 0.55rem;
                  color: ${COLORS.creamDim}; text-transform: uppercase;
                  letter-spacing: 0.08em; margin: 4px 0 8px;
                ">${item.category} · ${item.colorway}</div>
                <div style="
                  font-family: ${FONTS.body}; font-size: 0.65rem;
                  color: ${COLORS.cream}; line-height: 1.5;
                ">${item.description}</div>
                <div style="
                  font-family: ${FONTS.body}; font-size: 0.6rem;
                  color: ${COLORS.creamDim}; margin-top: 6px; font-style: italic;
                ">${item.keyDetail}</div>
              </div>
            </div>
          `; }).join('')}
        </div>
      </div>
    `));
  }

  return slides;
}

// ── 23: LOGO GRID ───────────────────────────────────

export function logoGrid(data: SlideData): string {
  const imgs = genImgs(data, 'logo');
  if (imgs.length === 0) return ''; // Don't render empty grid
  const labels = ['primary wordmark', 'icon / monogram', 'tour / event', 'social avatar'];
  // Adapt grid: 1 column if 1-2 logos, 2 columns if 3+
  const gridCols = imgs.length <= 2 ? '1fr' : '1fr 1fr';

  return lightSlide(`
    <div style="
      position: absolute; top: 30px; left: 60px; z-index: 20;
      font-family: ${FONTS.body}; font-size: 0.7rem;
      color: ${COLORS.inkLight}; letter-spacing: 0.12em;
      text-transform: uppercase;
    ">logo concepts</div>
    <div style="
      display: grid; grid-template-columns: ${gridCols};
      gap: 32px; padding: 100px 100px 60px;
      height: 100%;
    ">
      ${imgs.map((src, i) => `
        <div style="
          position: relative; overflow: hidden;
          background: ${i % 2 === 0 ? COLORS.white : COLORS.darkDeep};
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        ">
          <img src="${src}" style="max-width: 90%; max-height: 90%; object-fit: contain;" />
          <div style="
            position: absolute; bottom: 12px; left: 16px;
            font-family: ${FONTS.body}; font-size: 0.65rem;
            color: ${i % 2 === 0 ? COLORS.inkLight : COLORS.creamDim};
            letter-spacing: 0.1em; text-transform: uppercase;
          ">${labels[i] || ''}</div>
        </div>
      `).join('')}
    </div>
  `);
}

// ── 24: STAGE DESIGN ────────────────────────────────

export function stageDesign(data: SlideData): string {
  const img = genImgs(data, 'live')[0] || data.moodBoardImages[0] || '';
  const direction = data.touchpoints?.stage_design || '';

  return blackSlide(`
    ${img ? `<img src="${img}" style="
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      opacity: 0.7;
    " />` : ''}
    <div style="
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%);
    "></div>
    <div style="
      position: absolute; bottom: 80px; left: 80px; right: 80px; z-index: 2;
    ">
      ${maskingTape('STAGE DESIGN', { fontSize: '2rem' })}
      ${direction ? `<div style="
        ${bodyTextStyle()}
        font-size: 1rem; margin-top: 24px; max-width: 800px;
      ">${direction}</div>` : ''}
    </div>
  `);
}


// ════════════════════════════════════════════════════
// IDENTITY BIBLE TEMPLATES (25-26)
// ════════════════════════════════════════════════════

// ── 25: AESTHETIC FORMULA ───────────────────────────

export function aestheticFormula(data: SlideData): string {
  const pillars = data.contentPillars || [];
  const topTags = data.aestheticTags.slice(0, 3);

  const categories = pillars.length >= 3
    ? pillars.map(p => p.title)
    : topTags.map(t => `THE ${t.tag.toUpperCase()}`);

  return darkSlide(`
    <div style="padding: 80px 120px;">
      <div style="margin-bottom: 40px;">
        ${maskingTape('AESTHETIC FORMULA', { fontSize: '2.4rem' })}
      </div>
      <div style="
        ${bodyTextStyle()}
        font-size: 1.05rem; max-width: 1000px; margin-bottom: 56px;
      ">
        ${data.extendedNarrative || `the visual identity of ${data.artistName.toLowerCase()} lives at the intersection of three forces.`}
      </div>
      <div style="display: flex; gap: 40px;">
        ${categories.map((cat, i) => `
          <div style="flex: 1; text-align: center;">
            ${maskingTape(cat, { fontSize: '1.3rem', rotation: `${-1 + i}deg` })}
          </div>
        `).join('')}
      </div>
    </div>
  `);
}

// ── 26: STYLING DUALITY ─────────────────────────────

export function stylingDuality(data: SlideData): string {
  const duality = data.stylingDuality || { sideA: '', sideB: '', synthesis: '' };
  const imgs = [...data.starredImages, ...data.moodBoardImages].slice(0, 4);

  return darkSlide(`
    <div style="padding: 80px 0 80px 100px; width: 42%;">
      <div style="margin-bottom: 32px;">
        ${maskingTape('STYLING', { fontSize: '2.2rem' })}
      </div>
      <div style="${bodyTextStyle()} font-size: 0.95rem; line-height: 1.85;">
        <p style="margin-bottom: 20px;">${duality.sideA}</p>
        <p style="margin-bottom: 20px; color: ${COLORS.creamDim};">${duality.sideB}</p>
        <p style="font-style: italic;">${duality.synthesis}</p>
      </div>
    </div>
    <div style="position: absolute; right: 0; top: 0; width: 55%; height: 100%;">
      ${imgs.slice(0, 2).map((src, i) => collagPhoto(src, {
        width: '400px', height: '440px',
        top: i === 0 ? '60px' : '560px',
        right: i === 0 ? '60px' : '340px',
        rotation: i === 0 ? '-1.5deg' : '2deg',
        zIndex: i + 1,
        tape: i === 0 ? ['tl', 'br'] : ['tr', 'bl'],
      })).join('')}
      ${imgs[2] ? collagPhoto(imgs[2], {
        width: '300px', height: '340px',
        top: '140px', right: '500px',
        rotation: '1deg', zIndex: 3,
        tape: ['tr'],
      }) : ''}
    </div>
  `);
}


// ════════════════════════════════════════════════════
// EXPORT ALL TEMPLATES
// ════════════════════════════════════════════════════

export const TEMPLATES = {
  heroSlide,
  titleSlide,
  sectionDivider,
  sectionDividerLight,
  manifestoSlide,
  textAndCollage,
  textAndCollageLarge,
  textAndCollageLight,
  fullImageGrid,
  colorPaletteSlideDark,
  colorPaletteSlideLight,
  threeColumnFramework,
  threeColumnFrameworkDark,
  bulletListSlide,
  comparisonSlide,
  closingSlide,
  rolloutStrategy,
  videoOverview,
  videoTreatment,
  videoTreatmentGrid,
  talentRecommendation,
  tocSlide,
  productGrid,
  productDetailSlides,
  logoGrid,
  stageDesign,
  aestheticFormula,
  stylingDuality,
};
