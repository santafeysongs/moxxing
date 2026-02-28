/**
 * Reference Scorer — Auto-curates real reference images for the deck
 * 
 * After the world bible is generated, this module scores candidate images
 * from all sources (user uploads, Pinterest, Are.na, Behance) against the
 * world bible parameters using Claude Vision.
 * 
 * Top-scoring images get placed directly in the deck as real reference
 * imagery alongside AI-generated composites.
 */

import Anthropic from '@anthropic-ai/sdk';
import { WorldBible } from './world-bible';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface CandidateImage {
  url: string;           // URL to fetch the image from
  source: 'arena' | 'behance' | 'pinterest' | 'upload';
  sourceTitle?: string;  // e.g. Are.na channel name, Behance project name
  localBase64?: string;  // pre-loaded base64 (for uploads/pinterest already in memory)
  mimeType?: string;
}

export interface ScoredImage {
  url: string;
  source: string;
  sourceTitle?: string;
  score: number;         // 0-100
  reasoning: string;
  base64: string;
  mimeType: string;
}

export interface ScoringResult {
  scored: ScoredImage[];
  selected: ScoredImage[];  // top scorers that made the cut
  errors: string[];
}

/**
 * Fetch an image and return as base64. Handles URLs and pre-loaded data.
 */
async function fetchImageAsBase64(candidate: CandidateImage): Promise<{ base64: string; mimeType: string } | null> {
  if (candidate.localBase64) {
    return { base64: candidate.localBase64, mimeType: candidate.mimeType || 'image/jpeg' };
  }

  try {
    const res = await fetch(candidate.url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Contexx/1.0)' },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    // Skip tiny images (likely thumbnails/icons)
    if (buf.length < 5000) return null;
    // Skip huge images (>4MB base64 limit for Claude)
    if (buf.length > 3 * 1024 * 1024) return null;

    return { base64: buf.toString('base64'), mimeType: contentType.split(';')[0] };
  } catch {
    return null;
  }
}

/**
 * Score a batch of images against the world bible using Claude Vision.
 * Sends images in batches of 5 to keep context manageable.
 */
async function scoreBatch(
  images: { base64: string; mimeType: string; index: number }[],
  worldBible: WorldBible,
): Promise<{ index: number; score: number; reasoning: string }[]> {
  const anthropic = getClient();

  const content: any[] = [];
  content.push({
    type: 'text',
    text: `You are scoring reference images for a creative campaign. Score each image 0-100 based on how well it matches this world bible:

PALETTE: ${worldBible.palette?.join(', ')}
DOMINANT COLOR: ${worldBible.dominantColor}
MOOD: ${worldBible.worldDescription}
ERA: ${worldBible.eraReference || 'n/a'}
LIGHT: ${worldBible.lightQuality}, ${worldBible.lightTemperature}
TEXTURE: ${worldBible.filmStock}, ${worldBible.surfaceQuality}
CULTURAL REFERENCES: ${(worldBible.culturalTouchstones || []).join(', ')}
FORBIDDEN: ${(worldBible.forbiddenColors || []).join(', ')}
NEVER: ${worldBible.neverList?.slice(0, 4).join('. ')}

Score criteria (in order of importance):
1. Color alignment — does it live in the same palette world?
2. Mood/atmosphere match — same emotional register?
3. Composition quality — is this a well-composed professional image?
4. Era/aesthetic fit — same cultural moment?
5. Texture/grain — same surface quality?

Images to score:`,
  });

  for (const img of images) {
    content.push({ type: 'text', text: `Image ${img.index}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
    });
  }

  content.push({
    type: 'text',
    text: `Return ONLY a JSON array: [{"index": 0, "score": 75, "reason": "brief reason"}, ...]
Score 0-100. Be selective — most images should score below 50. Only images that truly belong in this visual world should score above 70.`,
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const text = (response.content[0] as any)?.text?.trim() || '';
    let jsonStr = text;
    if (jsonStr.includes('[')) jsonStr = jsonStr.slice(jsonStr.indexOf('['));
    if (jsonStr.includes(']')) jsonStr = jsonStr.slice(0, jsonStr.lastIndexOf(']') + 1);

    const parsed = JSON.parse(jsonStr);
    return parsed.map((p: any) => ({
      index: p.index,
      score: Math.min(100, Math.max(0, p.score || 0)),
      reasoning: p.reason || '',
    }));
  } catch (e: any) {
    console.warn(`  Scoring batch failed: ${e.message}`);
    return [];
  }
}

/**
 * Score and select the best reference images for the deck.
 * 
 * @param candidates All candidate images from all sources
 * @param worldBible The world bible to score against
 * @param maxSelect Maximum images to include in the deck (default 12)
 * @param minScore Minimum score to be included (default 60)
 */
export async function scoreAndSelectReferences(
  candidates: CandidateImage[],
  worldBible: WorldBible,
  maxSelect: number = 12,
  minScore: number = 55,
): Promise<ScoringResult> {
  console.log(`\nScoring ${candidates.length} candidate reference images against world bible...`);

  const result: ScoringResult = { scored: [], selected: [], errors: [] };

  // Phase 1: Fetch all images (parallel, with concurrency limit)
  const fetched: { candidate: CandidateImage; base64: string; mimeType: string }[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (c) => {
      const data = await fetchImageAsBase64(c);
      return data ? { candidate: c, ...data } : null;
    }));
    fetched.push(...results.filter(Boolean) as any[]);
    if (fetched.length > 0 && i > 0) {
      console.log(`  Fetched ${fetched.length}/${candidates.length} images...`);
    }
  }

  console.log(`  ${fetched.length} images fetched successfully`);
  if (fetched.length === 0) return result;

  // Phase 2: Score in batches of 5 (Claude Vision limit)
  const SCORE_BATCH = 5;
  const allScores: { index: number; score: number; reasoning: string }[] = [];

  for (let i = 0; i < fetched.length; i += SCORE_BATCH) {
    const batch = fetched.slice(i, i + SCORE_BATCH).map((f, j) => ({
      base64: f.base64,
      mimeType: f.mimeType,
      index: i + j,
    }));

    console.log(`  Scoring batch ${Math.floor(i / SCORE_BATCH) + 1}/${Math.ceil(fetched.length / SCORE_BATCH)}...`);
    const scores = await scoreBatch(batch, worldBible);
    allScores.push(...scores);

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Phase 3: Map scores back to candidates
  for (const score of allScores) {
    if (score.index >= fetched.length) continue;
    const f = fetched[score.index];
    result.scored.push({
      url: f.candidate.url,
      source: f.candidate.source,
      sourceTitle: f.candidate.sourceTitle,
      score: score.score,
      reasoning: score.reasoning,
      base64: f.base64,
      mimeType: f.mimeType,
    });
  }

  // Sort by score descending
  result.scored.sort((a, b) => b.score - a.score);

  // Select top scorers above minimum
  result.selected = result.scored
    .filter(s => s.score >= minScore)
    .slice(0, maxSelect);

  // Ensure source diversity — max 4 from any single source
  const sourceCounts: Record<string, number> = {};
  result.selected = result.selected.filter(s => {
    const key = `${s.source}:${s.sourceTitle || ''}`;
    sourceCounts[key] = (sourceCounts[key] || 0) + 1;
    return sourceCounts[key] <= 4;
  });

  console.log(`  Scored ${result.scored.length} images, selected ${result.selected.length} (min score: ${minScore})`);
  if (result.selected.length > 0) {
    console.log(`  Top score: ${result.selected[0].score} (${result.selected[0].source}: ${result.selected[0].sourceTitle || 'upload'})`);
    console.log(`  Sources: ${[...new Set(result.selected.map(s => s.source))].join(', ')}`);
  }

  return result;
}

/**
 * Build candidate list from all available sources.
 */
export function buildCandidateList(
  arenaMatches: { source: string; title: string; image_urls: string[] }[],
  behanceMatches: { source: string; title: string; image_urls: string[] }[],
  pinterestImages?: { base64: string; mimeType: string }[],
  uploadedImages?: { base64: string; mimeType: string }[],
): CandidateImage[] {
  const candidates: CandidateImage[] = [];

  // Are.na images (top 5 per matched channel, up to 30 total)
  for (const match of arenaMatches.slice(0, 6)) {
    for (const url of match.image_urls.slice(0, 5)) {
      candidates.push({
        url,
        source: 'arena',
        sourceTitle: match.title,
      });
    }
  }

  // Behance cover images
  for (const match of behanceMatches.slice(0, 8)) {
    for (const url of match.image_urls.slice(0, 2)) {
      candidates.push({
        url,
        source: 'behance',
        sourceTitle: match.title,
      });
    }
  }

  // Pinterest images (already in memory)
  if (pinterestImages) {
    for (const img of pinterestImages.slice(0, 15)) {
      candidates.push({
        url: 'pinterest-upload',
        source: 'pinterest',
        localBase64: img.base64,
        mimeType: img.mimeType,
      });
    }
  }

  // User uploads that weren't starred (supplementary references)
  if (uploadedImages) {
    for (const img of uploadedImages.slice(0, 10)) {
      candidates.push({
        url: 'user-upload',
        source: 'upload',
        localBase64: img.base64,
        mimeType: img.mimeType,
      });
    }
  }

  return candidates;
}
