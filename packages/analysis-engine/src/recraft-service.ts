/**
 * Recraft Service — Logo & Wordmark SVG/PNG Generation
 * 
 * Uses Recraft API for logo generation. Recraft is the only AI model
 * that outputs native vector (SVG) illustrations with design-quality typography.
 * 
 * Supported combos:
 *   recraftv3 + realistic_image | digital_illustration | vector_illustration | any
 *   recraft20b + vector_illustration | icon | digital_illustration | realistic_image
 */

import { WorldBible } from './world-bible';

const API_URL = 'https://external.api.recraft.ai/v1/images/generations';

function getApiKey(): string {
  const key = process.env.RECRAFT_API_KEY;
  if (!key) throw new Error('RECRAFT_API_KEY not set');
  return key;
}

export interface LogoResult {
  id: string;
  url: string;
  style: string;
  prompt: string;
  svgUrl?: string;
}

export interface LogoGenerationResult {
  artistName: string;
  logos: LogoResult[];
  errors: string[];
}

interface RecraftRequest {
  prompt: string;
  style: string;
  model: string;
  response_format: 'url' | 'b64_json';
  n: number;
  size: string;
  substyle?: string;
  colors?: { rgb: number[] }[];
}

async function generateOne(
  prompt: string,
  style: string,
  model: string,
  options?: {
    colors?: { rgb: number[] }[];
    size?: string;
  },
): Promise<{ url: string; id: string } | null> {
  const body: RecraftRequest = {
    prompt,
    style,
    model,
    response_format: 'url',
    n: 1,
    size: options?.size || '1024x1024',
  };

  if (options?.colors?.length) {
    body.colors = options.colors.slice(0, 5);
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`  Recraft error (${style}):`, err.message || res.status);
      return null;
    }

    const data = await res.json();
    if (data.data?.[0]) {
      return { url: data.data[0].url, id: data.data[0].image_id };
    }
    return null;
  } catch (e: any) {
    console.error(`  Recraft request failed:`, e.message);
    return null;
  }
}

/** Convert hex color to RGB array */
function hexToRgb(hex: string): number[] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Generate logo variations for an artist using Recraft.
 * Produces 5-8 logo variations across different styles.
 */
export async function generateLogos(
  artistName: string,
  worldBible?: WorldBible,
  typographyDirection?: string,
): Promise<LogoGenerationResult> {
  console.log(`\nGenerating logos for ${artistName} via Recraft...`);

  const result: LogoGenerationResult = { artistName, logos: [], errors: [] };

  // Extract brand colors from world bible
  const brandColors: { rgb: number[] }[] = [];
  if (worldBible?.palette) {
    for (const hex of worldBible.palette.slice(0, 4)) {
      try { brandColors.push({ rgb: hexToRgb(hex) }); } catch {}
    }
  }

  const typeHint = typographyDirection
    ? ` Typography direction: ${typographyDirection}.`
    : '';

  const moodHint = worldBible?.worldDescription
    ? ` The brand world is: ${worldBible.worldDescription.slice(0, 150)}.`
    : '';

  // Logo variations — different styles and approaches
  const logoSpecs: { prompt: string; style: string; model: string; label: string }[] = [
    // Primary wordmark — clean vector
    {
      prompt: `Clean, modern wordmark logo spelling "${artistName}" in a single line. Typographic logo only — no icons, no symbols, no imagery. Professional brand identity. White background.${typeHint}${moodHint}`,
      style: 'vector_illustration',
      model: 'recraftv3',
      label: 'primary-wordmark',
    },
    // Minimal monogram / icon
    {
      prompt: `Minimal monogram or lettermark using the initials of "${artistName}". Could be stamped, embossed, or etched. Simple, iconic, scalable. White background.`,
      style: 'icon',
      model: 'recraft20b',
      label: 'monogram',
    },
    // Condensed / editorial wordmark
    {
      prompt: `Condensed, editorial wordmark spelling "${artistName}". Tall, narrow letterforms. Clean, no illustration, just typography. White background.${typeHint}`,
      style: 'vector_illustration',
      model: 'recraftv3',
      label: 'condensed-wordmark',
    },
    // Hand-crafted wordmark
    {
      prompt: `Hand-crafted wordmark spelling "${artistName}". Brush, marker, or pen quality. Organic letterforms, not corporate. Just the word, white background.${typeHint}`,
      style: 'vector_illustration',
      model: 'recraft20b',
      label: 'hand-crafted-wordmark',
    },
  ];

  for (const spec of logoSpecs) {
    console.log(`  Generating ${spec.label}...`);
    const gen = await generateOne(spec.prompt, spec.style, spec.model, {
      colors: brandColors.length > 0 ? brandColors : undefined,
    });

    if (gen) {
      result.logos.push({
        id: gen.id,
        url: gen.url,
        style: spec.label,
        prompt: spec.prompt,
      });
      console.log(`  ✓ ${spec.label}`);
    } else {
      result.errors.push(`Failed: ${spec.label}`);
      console.log(`  ✗ ${spec.label}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Generated ${result.logos.length}/${logoSpecs.length} logos`);
  return result;
}
