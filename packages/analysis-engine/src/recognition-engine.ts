/**
 * Recognition Engine — Stage 1 of the CONTEXX architecture
 * 
 * Takes raw visual input and produces specific, nameable cultural nodes.
 * This is not a tagging system. It is a cultural lineage identification system.
 * 
 * Each image produces dozens of nodes across 14 categories.
 * Specificity is everything. Not "dark aesthetic" but "Hedi Slimane Dior Homme 2004."
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ── TYPES ──

export interface CulturalNode {
  id: string;
  name: string;
  category: number;
  categoryName: string;
  specificity: string;       // lineage/context — WHY this reference, not just WHAT
  imageIndex: number;        // which uploaded image it came from
  confidence: number;        // 0-1
}

export interface RecognitionResult {
  imageIndex: number;
  nodes: CulturalNode[];
  rawDescription: string;    // Claude's full analysis text for debugging
}

export interface BulkRecognitionResult {
  results: RecognitionResult[];
  allNodes: CulturalNode[];
  totalImages: number;
  totalNodes: number;
}

// ── SYSTEM PROMPT ──

const RECOGNITION_PROMPT = `You are a cultural recognition engine. Your job is to analyze reference images and identify specific, nameable cultural signals — not vibes, not categories, not mood descriptors.

For each image, identify as many specific cultural nodes as you can across these 14 categories. Every node must be specific enough that a knowledgeable person would immediately know the exact reference.

CATEGORIES:

01 PEOPLE — Specific humans and their specific contributions. Not "a photographer" but which photographer, which era, which project. Juergen Teller shooting Marc Jacobs 2001 ≠ Juergen Teller shooting Celine 2019.

02 BRANDS & HOUSES — Specific eras, collections, creative director tenures. Tom Ford Gucci ≠ Alessandro Michele Gucci. The brand name alone communicates nothing.

03 GARMENTS & MATERIALS — Specific types, origins, treatments, cultural lineage. Vegetable-tanned Italian leather ≠ Japanese horse hide. A velour tracksuit = Sean John, Dapper Dan era, Black luxury-in-sportswear tradition.

04 PRINT & GRAPHIC LANGUAGE — Specific print techniques, graphic design movements by practitioner, type foundries, print media formats.

05 PHOTOGRAPHY & IMAGE MAKING — Specific technical choices and cultural contexts. Flash photography is a spectrum. Film stocks by name. Camera formats by model.

06 LOCATIONS — Specific venues, streets, buildings, landscapes. Not "rural" but Gulf South Spanish moss = Southern Gothic + specific musical traditions + specific history.

07 MUSIC & SONIC CULTURE — Specific labels by era, subgenre moments by year/geography, producer aesthetics by project, format cultures.

08 FILM & VISUAL MEDIA — Specific directors by film (not filmography), cinematographers by project, color palettes by title. In the Mood for Love ≠ Chungking Express.

09 DIGITAL & INTERNET CULTURE — Platform aesthetics by era, interface-as-aesthetic, file format artifacts, specific digital community visual languages.

10 PRODUCT & OBJECT CULTURE — Specific objects that carry cultural weight. Lighter culture by brand. Ceramics by studio and glaze. Objects that exist in specific cultural pockets.

11 HAIR & BODY — Specific styles and what they signal culturally. A TWA signals something specific in Black hair culture. Dance styles by discipline and generation.

12 COLOR — Not color names. Specific shades, material origin, cultural associations in context. Ink black ≠ faded sun-black ≠ Japanese indigo overdye blue-black. Maroon velour ≠ maroon silk.

13 SYMBOLISM & JUXTAPOSITION — What elements are placed together and what tension that creates. Cultural code-switching within a frame. Not just individual symbols but the collision between them.

14 EQUIPMENT & TECHNICAL CULTURE — Specific equipment by model and cultural signal. Contax T2 = 90s fashion insider pocket. Mamiya RZ67 = medium format fashion authority. Fender Jazzmaster = shoegaze/indie. SM58 = live workhorse. Noritsu scan color science ≠ Frontier scan warmth. Lexicon 480L reverb = 80s studio luxury.

RESPONSE FORMAT:
Return a JSON array of nodes. Each node:
{
  "name": "specific reference name",
  "category": 1-14,
  "categoryName": "People",
  "specificity": "one sentence explaining the cultural lineage and why this is the specific reference, not a generic label",
  "confidence": 0.0-1.0
}

RULES:
- Minimum 10 nodes per image, aim for 20-30 if the image is rich
- Every node must be SPECIFIC. "Warm lighting" = rejected. "Tungsten practical lamp, 2700K, Nan Goldin Ballad of Sexual Dependency era" = accepted.
- When you're not sure of the exact reference, say so in specificity but still be as precise as possible
- Include equipment/technical observations when visible or inferable from the image quality
- A single garment might produce 3-4 nodes: the silhouette (category 03), the brand reference (02), the cultural signal of how it's worn (11), and what it's juxtaposed with (13)
- Return ONLY the JSON array. No commentary.`;

// ── SINGLE IMAGE RECOGNITION ──

export async function recognizeImage(
  imageBase64: string,
  mimeType: string,
  imageIndex: number,
): Promise<RecognitionResult> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: RECOGNITION_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType as any, data: imageBase64 },
        },
        {
          type: 'text',
          text: 'Analyze this image. Return the JSON array of cultural nodes.',
        },
      ],
    }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return { imageIndex, nodes: [], rawDescription: '' };
  }

  const raw = textContent.text.trim();
  let nodes: CulturalNode[] = [];

  try {
    // Extract JSON from response
    let jsonStr = raw;
    const fencedMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
    if (fencedMatch) jsonStr = fencedMatch[1].trim();
    if (!jsonStr.startsWith('[')) {
      const firstBracket = jsonStr.indexOf('[');
      if (firstBracket >= 0) jsonStr = jsonStr.substring(firstBracket);
    }
    const lastBracket = jsonStr.lastIndexOf(']');
    if (lastBracket >= 0) jsonStr = jsonStr.substring(0, lastBracket + 1);

    const parsed = JSON.parse(jsonStr);
    nodes = parsed.map((n: any, i: number) => ({
      id: slugify(`${n.categoryName || 'unknown'}-${n.name || i}`),
      name: n.name || 'Unknown',
      category: n.category || 0,
      categoryName: n.categoryName || 'Unknown',
      specificity: n.specificity || '',
      imageIndex,
      confidence: n.confidence || 0.5,
    }));
  } catch (e) {
    console.warn(`  Recognition parse failed for image ${imageIndex}:`, (e as Error).message?.slice(0, 100));
  }

  return { imageIndex, nodes, rawDescription: raw };
}

// ── BULK RECOGNITION ──

export async function recognizeAll(
  images: Array<{ base64: string; mimeType: string }>,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<BulkRecognitionResult> {
  const concurrency = options?.concurrency || 3;
  const results: RecognitionResult[] = [];
  let completed = 0;

  console.log(`Recognition engine: analyzing ${images.length} images (concurrency: ${concurrency})...`);

  // Process in batches
  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((img, j) => {
        const idx = i + j;
        console.log(`  [${idx + 1}/${images.length}] Recognizing...`);
        return recognizeImage(img.base64, img.mimeType, idx);
      }),
    );

    for (const r of batchResults) {
      results.push(r);
      completed++;
      console.log(`  ✓ Image ${r.imageIndex + 1}: ${r.nodes.length} nodes`);
      options?.onProgress?.(completed, images.length);
    }

    // Rate limit pause between batches
    if (i + concurrency < images.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const allNodes = results.flatMap(r => r.nodes);
  console.log(`Recognition complete: ${allNodes.length} total nodes from ${images.length} images`);

  return {
    results,
    allNodes,
    totalImages: images.length,
    totalNodes: allNodes.length,
  };
}

// ── HELPERS ──

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
