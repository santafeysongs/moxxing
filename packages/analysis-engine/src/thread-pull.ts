/**
 * Thread-Pull Engine — Stage 4 of the CONTEXX architecture
 * 
 * Takes the user's selected cultural nodes (up to 20) and pulls each one
 * outward through its network of cultural associations. Then analyzes
 * where threads overlap — those intersections are the creative foundation.
 * 
 * This replaces the old synthesis + world bible as the core intelligence layer.
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ── TYPES ──

export interface SelectedNode {
  id: string;
  name: string;
  category: number;
  categoryName: string;
  specificity: string;
}

export interface ThreadResult {
  nodeId: string;
  nodeName: string;
  people: string[];         // photographers, stylists, directors native to this lane
  brands: string[];         // fashion, objects, tools by specific era
  materials: string[];      // fabrics, finishes, surfaces, hardware
  locations: string[];      // venues, streets, landscapes
  productFormats: string[]; // objects that exist in this cultural pocket (NOT standard merch)
  visualLanguage: string[]; // how this lane photographs, lights, colors, types
  equipment: string[];      // cameras, instruments, tools native to this world
}

export interface Overlap {
  signal: string;           // the shared reference
  threadIds: string[];      // which nodes pointed to it
  threadNames: string[];    // human-readable
  strength: number;         // how many threads converge here
  type: 'person' | 'brand' | 'material' | 'location' | 'product' | 'visual' | 'equipment';
}

export interface ThreadPullResult {
  threads: ThreadResult[];
  overlaps: Overlap[];
  /** Top overlaps sorted by strength — the ingenuity zones */
  ingenuityZones: Overlap[];
  /** Flat synthesis for downstream: all unique signals organized by type */
  synthesis: {
    people: string[];
    brands: string[];
    materials: string[];
    locations: string[];
    productFormats: string[];
    visualLanguage: string[];
    equipment: string[];
  };
  /** User's missing context entries, treated as equal-weight nodes */
  userContext: string[];
}

// ── THREAD-PULL PROMPT ──

const THREAD_PULL_PROMPT = `You are a cultural intelligence engine. You're given a specific cultural signal — a node from a recognition engine. Your job is to follow this signal outward through its network of cultural associations.

This is not a database lookup. This is cultural fluency. You know who works with whom, what brands live in which pocket, what materials are native to which traditions.

For the given cultural node, return a JSON object with these fields:

{
  "people": ["specific person — role — era/project", ...],
  "brands": ["specific brand — era — positioning", ...],
  "materials": ["specific material — origin — cultural signal", ...],
  "locations": ["specific place — what it signals", ...],
  "productFormats": ["specific object/format that exists in this cultural pocket — NOT standard merch like tees/hoodies", ...],
  "visualLanguage": ["specific visual technique/reference — how this lane looks", ...],
  "equipment": ["specific gear — model — cultural signal", ...]
}

RULES:
- 3-8 entries per field. Quality over quantity.
- Every entry must be SPECIFIC. "A fashion photographer" = rejected. "Harley Weir, post-2018 tactile intimacy work" = accepted.
- productFormats should be SURPRISING but INEVITABLE. Not merch catalog items. Objects native to this world.
- If a field doesn't apply to this node, return an empty array.
- Return ONLY the JSON. No commentary.`;

// ── PULL A SINGLE THREAD ──

async function pullThread(node: SelectedNode): Promise<ThreadResult> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: THREAD_PULL_PROMPT,
    messages: [{
      role: 'user',
      content: `Pull the thread on this cultural node:\n\nName: ${node.name}\nCategory: ${node.categoryName}\nContext: ${node.specificity}`,
    }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return emptyThread(node);
  }

  try {
    let jsonStr = textContent.text.trim();
    const fencedMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
    if (fencedMatch) jsonStr = fencedMatch[1].trim();
    if (!jsonStr.startsWith('{')) {
      const idx = jsonStr.indexOf('{');
      if (idx >= 0) jsonStr = jsonStr.substring(idx);
    }
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace >= 0) jsonStr = jsonStr.substring(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr);
    return {
      nodeId: node.id,
      nodeName: node.name,
      people: parsed.people || [],
      brands: parsed.brands || [],
      materials: parsed.materials || [],
      locations: parsed.locations || [],
      productFormats: parsed.productFormats || [],
      visualLanguage: parsed.visualLanguage || [],
      equipment: parsed.equipment || [],
    };
  } catch {
    console.warn(`  Thread-pull parse failed for "${node.name}"`);
    return emptyThread(node);
  }
}

function emptyThread(node: SelectedNode): ThreadResult {
  return {
    nodeId: node.id, nodeName: node.name,
    people: [], brands: [], materials: [], locations: [],
    productFormats: [], visualLanguage: [], equipment: [],
  };
}

// ── PULL ALL THREADS ──

export async function pullAllThreads(
  nodes: SelectedNode[],
  userContext?: string,
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<ThreadPullResult> {
  const concurrency = options?.concurrency || 4;
  const threads: ThreadResult[] = [];
  let completed = 0;

  console.log(`Thread-pull: pulling ${nodes.length} threads (concurrency: ${concurrency})...`);

  // Process in batches
  for (let i = 0; i < nodes.length; i += concurrency) {
    const batch = nodes.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(node => {
        console.log(`  [${i + batch.indexOf(node) + 1}/${nodes.length}] Pulling: ${node.name}`);
        return pullThread(node);
      }),
    );

    threads.push(...batchResults);
    completed += batch.length;
    options?.onProgress?.(completed, nodes.length);

    if (i + concurrency < nodes.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── OVERLAP ANALYSIS ──
  const overlaps = findOverlaps(threads);

  // Sort by strength — strongest overlaps = ingenuity zones
  const ingenuityZones = overlaps
    .filter(o => o.strength >= 2)
    .sort((a, b) => b.strength - a.strength);

  // Build flat synthesis
  const synthesis = buildSynthesis(threads);

  // Parse user context into entries
  const userEntries = userContext
    ? userContext.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
    : [];

  console.log(`Thread-pull complete: ${threads.length} threads, ${overlaps.length} overlaps, ${ingenuityZones.length} ingenuity zones`);

  return {
    threads,
    overlaps,
    ingenuityZones,
    synthesis,
    userContext: userEntries,
  };
}

// ── OVERLAP DETECTION ──

type SignalType = 'person' | 'brand' | 'material' | 'location' | 'product' | 'visual' | 'equipment';

function findOverlaps(threads: ThreadResult[]): Overlap[] {
  // Build a map of normalized signal → which threads reference it
  const signalMap = new Map<string, { type: SignalType; threadIds: string[]; threadNames: string[]; raw: string }>();

  for (const thread of threads) {
    const addSignals = (items: string[], type: SignalType) => {
      for (const item of items) {
        const key = normalizeSignal(item);
        if (!signalMap.has(key)) {
          signalMap.set(key, { type, threadIds: [], threadNames: [], raw: item });
        }
        const entry = signalMap.get(key)!;
        if (!entry.threadIds.includes(thread.nodeId)) {
          entry.threadIds.push(thread.nodeId);
          entry.threadNames.push(thread.nodeName);
        }
      }
    };

    addSignals(thread.people, 'person');
    addSignals(thread.brands, 'brand');
    addSignals(thread.materials, 'material');
    addSignals(thread.locations, 'location');
    addSignals(thread.productFormats, 'product');
    addSignals(thread.visualLanguage, 'visual');
    addSignals(thread.equipment, 'equipment');
  }

  // Convert to overlaps (only where 2+ threads converge)
  const overlaps: Overlap[] = [];
  for (const [, entry] of signalMap) {
    if (entry.threadIds.length >= 2) {
      overlaps.push({
        signal: entry.raw,
        threadIds: entry.threadIds,
        threadNames: entry.threadNames,
        strength: entry.threadIds.length,
        type: entry.type,
      });
    }
  }

  return overlaps;
}

function normalizeSignal(signal: string): string {
  // Extract the core reference — strip era/context info for matching
  // "Harley Weir — post-2018 tactile work" and "Harley Weir, intimate editorial" should match
  return signal
    .toLowerCase()
    .replace(/[—–\-,]/g, ' ')
    .replace(/\b(era|period|post|pre|early|late|circa|c\.|ca\.)\b/g, '')
    .replace(/\b\d{4}s?\b/g, '') // remove years
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3) // first 3 words = the core identity
    .join(' ');
}

// ── BUILD FLAT SYNTHESIS ──

function buildSynthesis(threads: ThreadResult[]) {
  const dedup = (items: string[]) => [...new Set(items)];

  return {
    people: dedup(threads.flatMap(t => t.people)),
    brands: dedup(threads.flatMap(t => t.brands)),
    materials: dedup(threads.flatMap(t => t.materials)),
    locations: dedup(threads.flatMap(t => t.locations)),
    productFormats: dedup(threads.flatMap(t => t.productFormats)),
    visualLanguage: dedup(threads.flatMap(t => t.visualLanguage)),
    equipment: dedup(threads.flatMap(t => t.equipment)),
  };
}
