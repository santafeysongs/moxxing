import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// World bible removed — thread-pull replaces it

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export interface ArtistPhoto {
  base64: string;
  mimeType: string;
}

export interface MoodBoardImage {
  base64: string;
  mimeType: string;
}

export interface GeneratedImage {
  id: string;
  base64: string;
  prompt: string;
  category: string;
  section: string;
}

export interface ImageGenerationResult {
  artistName: string;
  images: GeneratedImage[];
  errors: string[];
}

// ── ANTI-AI CONSTANT ──
// Shorter, more direct. Long anti-AI blocks paradoxically make Gemini try harder to be "perfect".
const ANTI_AI = `Shot on 35mm film. Imperfect focus. Visible grain. Real photography — not AI, not stock, not retouched.`;

const NO_TEXT = `No text, no titles, no watermarks, no typography. Photography only.`;

const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

function isImageTooLarge(base64: string): boolean {
  return (base64.length * 0.75) > MAX_IMAGE_BYTES;
}

/**
 * Resize an image if it's too large for the Gemini API.
 * Uses sharp if available, otherwise returns null to skip.
 */
async function resizeIfNeeded(base64: string, mimeType: string): Promise<{ base64: string; mimeType: string } | null> {
  const bytes = base64.length * 0.75;
  if (bytes <= MAX_IMAGE_BYTES) return { base64, mimeType };

  try {
    const sharp = require('sharp');
    const buf = Buffer.from(base64, 'base64');
    // Resize to max 2048px on longest side, convert to JPEG quality 85
    const resized = await sharp(buf)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const newBase64 = resized.toString('base64');
    console.log(`  📐 Resized image: ${(bytes/1024/1024).toFixed(1)}MB → ${(resized.length/1024/1024).toFixed(1)}MB`);
    return { base64: newBase64, mimeType: 'image/jpeg' };
  } catch (e: any) {
    // sharp not available — try basic approach with canvas
    console.warn(`  ⚠ Cannot resize (sharp not available): ${e.message}. Skipping large image.`);
    return null;
  }
}

// ── CORE GENERATION FUNCTION ──

async function generateSingleImage(
  prompt: string,
  category: string,
  section: string,
  styleRefs: MoodBoardImage[],
  artistPhotos: ArtistPhoto[],
): Promise<GeneratedImage | null> {
  const ai = getClient();
  const contentParts: any[] = [];

  // Artist identity
  if (artistPhotos.length > 0) {
    const hasAiRender = artistPhotos.length > 1;
    if (hasAiRender) {
      contentParts.push('ARTIST IDENTITY — these are photos of the artist. The LAST image shows how they\'ve already been rendered in this campaign. Match that interpretation exactly:');
    } else {
      contentParts.push('ARTIST IDENTITY — this is what the artist looks like:');
    }
    for (const photo of artistPhotos) {
      if (!isImageTooLarge(photo.base64)) {
        contentParts.push({ inlineData: { data: photo.base64, mimeType: photo.mimeType } });
      }
    }
  }

  // Style references
  if (styleRefs.length > 0) {
    if (styleRefs.length === 1) {
      contentParts.push('ENVIRONMENT REFERENCE — place the artist INTO this exact world. Match the lighting, color grade, textures, spatial logic, and atmosphere precisely:');
    } else {
      contentParts.push('REFERENCE IMAGES — the FIRST image is the primary environment. Match it exactly. Additional images provide supplementary mood/style context:');
    }
    for (const ref of styleRefs) {
      if (!isImageTooLarge(ref.base64)) {
        contentParts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
      }
    }
  }

  contentParts.push(prompt);

  try {
    const response = await ai.models.generateContent({
      model: 'nano-banana-pro-preview',
      contents: [{ role: 'user', parts: contentParts.map(p => typeof p === 'string' ? { text: p } : p) }],
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) return null;

    for (const part of candidates[0].content?.parts || []) {
      if ((part as any).inlineData) {
        return {
          id: crypto.randomUUID(),
          base64: (part as any).inlineData.data,
          prompt,
          category,
          section,
        };
      }
    }
    return null;
  } catch (err: any) {
    console.error(`  ✗ Generation failed (${category}):`, err.message?.slice(0, 200));
    return null;
  }
}

// ── ARTIST APPEARANCE DESCRIPTION ──

async function describeArtistAppearance(artistPhotos: ArtistPhoto[]): Promise<string> {
  if (artistPhotos.length === 0) return 'the artist (a person)';
  try {
    const ai = getClient();
    const imageParts = artistPhotos.slice(0, 3).map(p => ({
      inlineData: { data: p.base64, mimeType: p.mimeType },
    }));
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          ...imageParts,
          { text: 'Describe this person in 5-6 words max. Example: "young woman, short blonde hair" or "tall man, beard, dark skin". Just the essentials to identify them. Nothing else.' },
        ],
      }],
      config: { temperature: 0.1, maxOutputTokens: 50 },
    });
    const desc = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    console.log(`  Artist description: ${desc.slice(0, 100)}...`);
    return desc || 'the artist';
  } catch (e: any) {
    console.warn(`  Could not describe artist: ${e.message}`);
    return 'the artist';
  }
}

// Auto-pairing removed — all artist photos go into every prompt so nano sees multiple angles

// ── SECONDARY SCENE TEMPLATES ──
// Cover art, packaging, products — rotate through featured refs + mood board refs.

interface SecondaryScene {
  section: string;
  category: string;
  artistRefs: number;
  prompt: (a: string, n: string, wb: string) => string;
}

const SECONDARY_SCENES: SecondaryScene[] = [
  // ── COVER ART (3) ──
  { section: 'cover-art', category: 'cover-album', artistRefs: 1,
    prompt: (a, n, wb) => `Square album cover. The ${a} in the reference world. Tight crop portrait. Same lighting. ${ANTI_AI} ${NO_TEXT}` },
  { section: 'cover-art', category: 'cover-single-1', artistRefs: 1,
    prompt: (a, n, wb) => `Square single cover. The ${a} in the reference world. One strong image. ${ANTI_AI} ${NO_TEXT}` },
  { section: 'cover-art', category: 'cover-single-2', artistRefs: 0,
    prompt: (a, n, wb) => `Abstract single artwork. No person. Match the color and texture of the reference images. Square format. ${ANTI_AI} ${NO_TEXT}` },

  // ── PACKAGING (2) ──
  { section: 'packaging', category: 'packaging-vinyl', artistRefs: 0,
    prompt: (a, n, wb) => `Vinyl record and gatefold on a real surface. Same color palette as reference images. Natural light, overhead angle. ${ANTI_AI} ${NO_TEXT}` },
  { section: 'packaging', category: 'packaging-special', artistRefs: 0,
    prompt: (a, n, wb) => `Collector's box set flat lay — vinyl, zine, prints. Same world as the reference images. Real surface, natural light. ${ANTI_AI} ${NO_TEXT}` },

  // ── PRODUCT DESIGN (3) ──
  { section: 'product', category: 'product-tee', artistRefs: 0,
    prompt: (a, n, wb) => `T-shirt in the reference environment. Same light, same surfaces. Match the product reference style. Real photograph, not a mockup. ${ANTI_AI} ${NO_TEXT}` },
  { section: 'product', category: 'product-hoodie', artistRefs: 0,
    prompt: (a, n, wb) => `Hoodie in the reference world. Same textures, same light. Match the product reference aesthetic. ${ANTI_AI} ${NO_TEXT}` },
  { section: 'product', category: 'product-poster', artistRefs: 0,
    prompt: (a, n, wb) => `Tour poster on a wall in the reference environment. Wheat-pasted, weathered. Street photography. ${ANTI_AI} ${NO_TEXT}` },

  // Live performance removed from image generation — use real reference images instead of AI mockups
];

// ── MAIN GENERATION FUNCTION ──

export async function generateCreativeImages(
  artistName: string,
  synthesis: any,
  artistPhotos?: ArtistPhoto[],
  moodBoardImages?: MoodBoardImage[],
  outputDir?: string,
  options?: {
    featuredImages?: MoodBoardImage[];  // the user's starred/featured references
    productRefImages?: MoodBoardImage[];  // user-uploaded product reference images
    visualLanguage?: string[];  // from thread-pull: visual language signals
  },
): Promise<ImageGenerationResult> {
  console.log(`\nGenerating creative direction images for ${artistName}...`);

  const result: ImageGenerationResult = { artistName, images: [], errors: [] };
  if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

  // Resize oversized images instead of dropping them
  const safeArtistPhotos: ArtistPhoto[] = [];
  for (const p of (artistPhotos || [])) {
    if (!isImageTooLarge(p.base64)) {
      safeArtistPhotos.push(p);
    } else {
      const resized = await resizeIfNeeded(p.base64, p.mimeType);
      if (resized) safeArtistPhotos.push({ base64: resized.base64, mimeType: resized.mimeType });
    }
  }
  const safeStyleRefs: MoodBoardImage[] = [];
  for (const r of (moodBoardImages || [])) {
    if (!isImageTooLarge(r.base64)) {
      safeStyleRefs.push(r);
    } else {
      const resized = await resizeIfNeeded(r.base64, r.mimeType);
      if (resized) safeStyleRefs.push({ base64: resized.base64, mimeType: resized.mimeType });
    }
  }
  const featuredImages: MoodBoardImage[] = [];
  for (const r of (options?.featuredImages || [])) {
    if (!isImageTooLarge(r.base64)) {
      featuredImages.push(r);
    } else {
      const resized = await resizeIfNeeded(r.base64, r.mimeType);
      if (resized) featuredImages.push({ base64: resized.base64, mimeType: resized.mimeType });
    }
  }
  const productRefImages = (options?.productRefImages || []).filter(r => !isImageTooLarge(r.base64));

  // Thread-pull visual language signals (light text guidance for image gen)
  const visualCues = (options?.visualLanguage || []).slice(0, 3).join('. ');

  // Describe the artist's appearance
  const artistDescription = await describeArtistAppearance(safeArtistPhotos);

  console.log(`  ${safeArtistPhotos.length} artist photos, ${featuredImages.length} featured refs, ${safeStyleRefs.length} total refs`);
  console.log(`  Visual language cues: ${visualCues || 'none'}`);

  // ── AUTO-PAIR artist photos to featured references ──
  // Generate one hero scene per featured image — no arbitrary cap.
  // The user decides how many by starring images in the curate step (up to 20).
  const allFeatured = featuredImages.length > 0 ? featuredImages : safeStyleRefs.slice(0, 6);
  const featuresToProcess = allFeatured.slice(0, 20);
  // All artist photos sent to every prompt — no pairing needed

  // ── PHASE 1: FEATURED IMAGE SCENES ──
  // Each featured/starred image becomes a deliberate environment.
  // Each gets paired with a specific artist photo chosen by Claude Vision.

  // The reference images do the heavy lifting. The prompt just tells Gemini:
  // 1. WHO the artist is (physical description so it knows which person to swap in)
  // 2. WHAT to do (put them in the reference environment)
  // 3. HOW it should feel (shot type)
  const FEATURED_PROMPTS = [
    (a: string) => `Put the ${a} into the reference environment. Same lighting, same color grade. Full body editorial. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `Put the ${a} into this world. Candid, not posed. Same colors, same light. Medium shot. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `Close-up of the ${a} in the reference world. Same tones, same mood. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `Wide shot — the ${a} small in the reference environment. Same palette. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `The ${a} in profile in the reference environment. Match the light exactly. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `The ${a} performing in the reference world. Same lighting. Raw. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `Empty shot of the reference environment. No people. Same light, same color. ${ANTI_AI} ${NO_TEXT}`,
    (a: string) => `The ${a} mid-movement in the reference environment. Documentary feel. ${ANTI_AI} ${NO_TEXT}`,
  ];

  // ── CAP: Each featured image used ONCE — one scene per reference, max 8 total ──
  const MAX_USES_PER_FEATURED = 1;
  const featuredUseCount: number[] = new Array(featuresToProcess.length).fill(0);

  // Build generation plan: one prompt per featured image, no repeats
  interface GenerationSlot {
    featuredIdx: number;
    promptIdx: number;
  }
  const generationPlan: GenerationSlot[] = [];
  let promptCounter = 0;

  // First pass: one prompt per featured image
  for (let i = 0; i < featuresToProcess.length; i++) {
    generationPlan.push({ featuredIdx: i, promptIdx: promptCounter++ });
    featuredUseCount[i]++;
  }

  // No second pass — one scene per featured image keeps output diverse and non-repetitive

  console.log(`  Generation plan: ${generationPlan.length} photo scenes across ${featuresToProcess.length} featured images`);

  for (let i = 0; i < generationPlan.length; i++) {
    const slot = generationPlan[i];
    const featuredRef = featuresToProcess[slot.featuredIdx];
    const category = `featured-${i + 1}`;
    const section = i < 8 ? 'photography' : 'video';

    console.log(`  [${i + 1}/${generationPlan.length + SECONDARY_SCENES.length}] ${section} / ${category} — ref ${slot.featuredIdx + 1}, prompt ${slot.promptIdx + 1}...`);

    // Style ref: the featured image for this scene
    let styleRefs: MoodBoardImage[] = [featuredRef];

    // ALL artist photos — gives nano multiple angles to understand the person
    let artistRefs: ArtistPhoto[] = [...safeArtistPhotos];

    const basePrompt = FEATURED_PROMPTS[slot.promptIdx % FEATURED_PROMPTS.length](artistDescription);
    const prompt = visualCues ? `${basePrompt} Visual cues: ${visualCues}` : basePrompt;
    const image = await generateSingleImage(prompt, category, section, styleRefs, artistRefs);

    if (image) {
      result.images.push(image);
      console.log(`  ✓ ${category}`);
      if (outputDir) {
        fs.writeFileSync(path.join(outputDir, `${category}.png`), Buffer.from(image.base64, 'base64'));
      }
    } else {
      result.errors.push(`Failed: ${category}`);
      console.log(`  ✗ ${category}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // ── PHASE 2: SECONDARY SCENES ──
  // Cover art, packaging, products — rotate through featured refs + random mood board refs.
  // The randomness is intentional — ingenuity comes from unexpected combinations.

  const totalScenes = generationPlan.length + SECONDARY_SCENES.length;
  for (let i = 0; i < SECONDARY_SCENES.length; i++) {
    const scene = SECONDARY_SCENES[i];
    const sceneNum = generationPlan.length + i + 1;
    console.log(`  [${sceneNum}/${totalScenes}] ${scene.section} / ${scene.category}...`);

    let styleRefs: MoodBoardImage[] = [];

    if (scene.section === 'product' && productRefImages.length > 0) {
      // Product scenes: product reference images + one featured ref for campaign world
      const prodIdx = SECONDARY_SCENES.filter(s => s.section === 'product').indexOf(scene);
      for (let j = 0; j < Math.min(2, productRefImages.length); j++) {
        styleRefs.push(productRefImages[(prodIdx + j) % productRefImages.length]);
      }
      if (featuresToProcess.length > 0) {
        styleRefs.push(featuresToProcess[prodIdx % featuresToProcess.length]);
      }
    } else {
      // Rotate through featured refs + random mood board ref for unexpected texture
      if (featuresToProcess.length > 0) {
        styleRefs.push(featuresToProcess[i % featuresToProcess.length]);
      }
      if (safeStyleRefs.length > 0) {
        styleRefs.push(safeStyleRefs[(i * 3) % safeStyleRefs.length]);
      }
    }

    // All artist photos for scenes that need the artist
    let artistRefs: ArtistPhoto[] = scene.artistRefs > 0 ? [...safeArtistPhotos] : [];

    const baseScenePrompt = scene.prompt(artistDescription, artistName, '');
    const prompt = visualCues ? `${baseScenePrompt} Visual cues: ${visualCues}` : baseScenePrompt;
    const image = await generateSingleImage(prompt, scene.category, scene.section, styleRefs, artistRefs);

    if (image) {
      result.images.push(image);
      console.log(`  ✓ ${scene.category}`);
      if (outputDir) {
        fs.writeFileSync(path.join(outputDir, `${scene.category}.png`), Buffer.from(image.base64, 'base64'));
      }
    } else {
      result.errors.push(`Failed: ${scene.category}`);
      console.log(`  ✗ ${scene.category}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nGenerated ${result.images.length}/${totalScenes} images`);
  return result;
}

// buildFallbackDirection removed — world bible is gone, visual language comes from thread-pull
