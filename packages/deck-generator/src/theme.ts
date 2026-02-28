/**
 * Theme — Shared CSS constants and reusable design components
 * 
 * Design language: Clean, modern, editorial. 
 * Bold typography, strong contrast, photo-forward.
 * No decorative elements (no tape, stains, torn paper).
 */

// ── COLORS ──────────────────────────────────────────

export const COLORS = {
  // Light slides
  paper: '#f5f2ed',
  paperDark: '#eae5de',
  inkDark: '#1a1a1a',
  inkMedium: '#444444',
  inkLight: '#777777',

  // Dark slides
  dark: '#1a1a1a',
  darkDeep: '#111111',
  cream: '#f0ebe3',
  creamDim: '#b0a99f',

  // Black slides
  black: '#000000',
  white: '#ffffff',
  whiteDim: 'rgba(255,255,255,0.7)',

  // Accents (used sparingly)
  accent: '#1a1a1a',
  accentLight: 'rgba(0,0,0,0.06)',
};

// ── FONTS ───────────────────────────────────────────

export const FONTS_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Unbounded:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
`;

export const FONTS = {
  // Body text
  body: "'Inter', -apple-system, sans-serif",
  // Section headers — bold display
  header: "'Unbounded', sans-serif",
  // Display/emphasis
  display: "'Unbounded', sans-serif",
  // Mono for technical details
  mono: "'JetBrains Mono', monospace",
};

// ── BASE STYLES ─────────────────────────────────────

export function baseStyles(): string {
  return `
    ${FONTS_IMPORT}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1920px; height: 1080px; overflow: hidden;
      font-family: ${FONTS.body};
      font-size: 20px;
      -webkit-font-smoothing: antialiased;
    }
    .slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
  `;
}

// ── BACKWARD COMPAT (clean versions of old decorative functions) ──

/** Was masking-tape header, now just bold text */
export function maskingTape(text: string, opts?: { width?: string; fontSize?: string; rotation?: string }): string {
  const fontSize = opts?.fontSize || '3.2rem';
  return `
    <div style="
      display: inline-block;
      font-family: ${FONTS.header};
      font-size: ${fontSize};
      font-weight: 800;
      color: inherit;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.05;
    ">${text}</div>
  `;
}

/** Was paper texture, now just clean bg */
export function paperTextureBg(): string {
  return `background-color: ${COLORS.paper};`;
}

/** Was coffee stain overlays, now nothing */
export function coffeeStains(): string { return ''; }

/** Was black tape corners, now nothing */
export function blackTapeStrip(_opts?: any): string { return ''; }

/** Was collage photo with tape, now clean positioned photo */
export function collagPhoto(
  src: string,
  opts: {
    width: string; height: string;
    top?: string; left?: string; right?: string; bottom?: string;
    rotation?: string; zIndex?: number; tape?: any[];
  }
): string {
  return photo(src, {
    width: opts.width, height: opts.height,
    top: opts.top, left: opts.left, right: opts.right, bottom: opts.bottom,
    zIndex: opts.zIndex,
  });
}

/** Was torn paper card, now clean card */
export function tornPaperCard(content: string, opts?: { width?: string; bg?: string }): string {
  return contentCard(content, { width: opts?.width, bg: opts?.bg });
}

// ── SECTION HEADER ──────────────────────────────────

export function sectionHeader(text: string, opts?: { fontSize?: string; color?: string }): string {
  const fontSize = opts?.fontSize || '3.2rem';
  const color = opts?.color || COLORS.inkDark;

  return `
    <div style="
      display: inline-block;
      font-family: ${FONTS.header};
      font-size: ${fontSize};
      font-weight: 800;
      color: ${color};
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.05;
    ">${text}</div>
  `;
}

// ── PHOTO COMPONENT ─────────────────────────────────

export function photo(
  src: string,
  opts: {
    width: string;
    height: string;
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
    borderRadius?: string;
    zIndex?: number;
    objectPosition?: string;
  }
): string {
  const z = opts.zIndex || 1;
  const radius = opts.borderRadius || '0';
  const objPos = opts.objectPosition || 'center';
  const posStyle = [
    opts.top !== undefined ? `top: ${opts.top}` : '',
    opts.left !== undefined ? `left: ${opts.left}` : '',
    opts.right !== undefined ? `right: ${opts.right}` : '',
    opts.bottom !== undefined ? `bottom: ${opts.bottom}` : '',
  ].filter(Boolean).join('; ');

  return `
    <div style="
      position: absolute; ${posStyle};
      width: ${opts.width}; height: ${opts.height};
      z-index: ${z};
      overflow: hidden;
      border-radius: ${radius};
    ">
      <img src="${src}" style="
        width: 100%; height: 100%;
        object-fit: cover;
        object-position: ${objPos};
        display: block;
      " />
    </div>
  `;
}

// ── CONTENT CARD ────────────────────────────────────

export function contentCard(content: string, opts?: { width?: string; bg?: string; padding?: string }): string {
  const bg = opts?.bg || COLORS.paper;
  const width = opts?.width || '100%';
  const padding = opts?.padding || '48px 40px';

  return `
    <div style="
      width: ${width};
      background: ${bg};
      padding: ${padding};
      position: relative;
    ">
      ${content}
    </div>
  `;
}

// ── BODY TEXT STYLE ─────────────────────────────────

export function bodyTextStyle(color?: string): string {
  return `
    font-family: ${FONTS.body};
    font-size: 1.15rem;
    line-height: 1.75;
    color: ${color || COLORS.cream};
    font-weight: 400;
    letter-spacing: 0.01em;
  `;
}

// ── SLIDE WRAPPER HELPERS ───────────────────────────

export function darkSlide(content: string): string {
  return `<!DOCTYPE html><html><head><style>
    ${baseStyles()}
    body { background: ${COLORS.dark}; color: ${COLORS.cream}; }
  </style></head><body><div class="slide">
    ${content}
  </div></body></html>`;
}

export function lightSlide(content: string): string {
  return `<!DOCTYPE html><html><head><style>
    ${baseStyles()}
    body { background: ${COLORS.paper}; color: ${COLORS.inkDark}; }
  </style></head><body><div class="slide">
    ${content}
  </div></body></html>`;
}

export function blackSlide(content: string): string {
  return `<!DOCTYPE html><html><head><style>
    ${baseStyles()}
    body { background: ${COLORS.black}; color: ${COLORS.white}; }
  </style></head><body><div class="slide">
    ${content}
  </div></body></html>`;
}
