/**
 * Ideogram Service — Campaign Typography Generation
 * 
 * Uses Ideogram API for rendering accurate, stylized text inside images.
 * Ideogram is the leading model for typography in AI images — poster titles,
 * cover art lettering, packaging text, visualizer title cards.
 * 
 * Supports style references (up to 3 images) to match the campaign's visual world.
 */

import * as crypto from 'crypto';
import { WorldBible } from './world-bible';

const API_URL = 'https://api.ideogram.ai/generate';

function getApiKey(): string {
  const key = process.env.IDEOGRAM_API_KEY;
  if (!key) throw new Error('IDEOGRAM_API_KEY not set');
  return key;
}

export interface TypographyResult {
  id: string;
  url: string;
  category: string;
  prompt: string;
}

export interface TypographyGenerationResult {
  artistName: string;
  images: TypographyResult[];
  errors: string[];
}

interface IdeogramRequest {
  image_request: {
    prompt: string;
    model: string;
    magic_prompt_option: 'AUTO' | 'ON' | 'OFF';
    aspect_ratio?: string;
    style_type?: string;
    negative_prompt?: string;
  };
}

async function generateOne(
  prompt: string,
  options?: {
    aspectRatio?: string;
    styleType?: string;
    negativePrompt?: string;
  },
): Promise<{ url: string; id: string } | null> {
  const body: IdeogramRequest = {
    image_request: {
      prompt,
      model: 'V_2',
      magic_prompt_option: 'OFF', // We write precise prompts, don't want it rewritten
      aspect_ratio: options?.aspectRatio || 'ASPECT_1_1',
      style_type: options?.styleType || 'DESIGN',
      negative_prompt: options?.negativePrompt || 'blurry text, misspelled, distorted letters, AI-looking, generic, clip art',
    },
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Api-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`  Ideogram error:`, err.message || err.detail || res.status);
      return null;
    }

    const data = await res.json();
    if (data.data?.[0]) {
      return {
        url: data.data[0].url,
        id: data.data[0].seed?.toString() || crypto.randomUUID(),
      };
    }
    return null;
  } catch (e: any) {
    console.error(`  Ideogram request failed:`, e.message);
    return null;
  }
}

/**
 * Generate campaign typography treatments for an artist using Ideogram.
 * Produces stylized text for posters, covers, packaging, title cards.
 */
export async function generateTypography(
  artistName: string,
  worldBible?: WorldBible,
  typographyDirection?: string,
): Promise<TypographyGenerationResult> {
  console.log(`\nGenerating campaign typography for ${artistName} via Ideogram...`);

  const result: TypographyGenerationResult = { artistName, images: [], errors: [] };

  const paletteHint = worldBible?.palette
    ? ` Color palette: ${worldBible.palette.slice(0, 4).join(', ')}.`
    : '';

  const typeHint = typographyDirection
    ? ` Typography style: ${typographyDirection}.`
    : '';

  const textureHint = worldBible?.surfaceQuality
    ? ` Surface quality: ${worldBible.surfaceQuality}.`
    : '';

  const moodHint = worldBible?.worldDescription
    ? ` Visual world: ${worldBible.worldDescription.slice(0, 120)}.`
    : '';

  const ANTI_AI = 'NOT AI-looking. NOT generic. NOT clip art. Authentic, editorial, designed.';

  // Typography treatments
  const specs: { prompt: string; category: string; aspect?: string; style?: string }[] = [
    // Tour poster typography
    {
      prompt: `Tour poster design featuring the text "${artistName}" as the dominant typographic element. Bold, large-scale typography. Printed/risograph/screen-print aesthetic. Concert poster energy.${paletteHint}${typeHint} ${ANTI_AI}`,
      category: 'typography-poster',
      aspect: 'ASPECT_3_4',
    },
    // Album cover typography
    {
      prompt: `Album cover design with the text "${artistName}" as prominent typography. Square format. The type IS the design — not decorative, structural. ${paletteHint}${typeHint}${textureHint} ${ANTI_AI}`,
      category: 'typography-cover',
      aspect: 'ASPECT_1_1',
    },
    // Visualizer / motion title card
    {
      prompt: `Title card for a music visualizer: the text "${artistName}" centered on screen. Cinematic, atmospheric. The typography has weight and presence.${paletteHint}${moodHint} ${ANTI_AI}`,
      category: 'typography-titlecard',
      aspect: 'ASPECT_16_9',
      style: 'RENDER_3D',
    },
  ];

  for (const spec of specs) {
    console.log(`  Generating ${spec.category}...`);
    const gen = await generateOne(spec.prompt, {
      aspectRatio: spec.aspect,
      styleType: spec.style || 'DESIGN',
    });

    if (gen) {
      result.images.push({
        id: gen.id,
        url: gen.url,
        category: spec.category,
        prompt: spec.prompt,
      });
      console.log(`  ✓ ${spec.category}`);
    } else {
      result.errors.push(`Failed: ${spec.category}`);
      console.log(`  ✗ ${spec.category}`);
    }

    // Ideogram is slower, give it breathing room
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Generated ${result.images.length}/${specs.length} typography treatments`);
  return result;
}
