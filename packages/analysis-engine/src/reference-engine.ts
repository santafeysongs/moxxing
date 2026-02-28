/**
 * Reference Engine — Matches user mood board analysis against scraped creative references.
 * 
 * Phase 1: Text-based matching (channel titles/descriptions vs analysis tags)
 * Phase 2: CLIP embedding similarity (coming later)
 * 
 * Injects matched references into the synthesis prompt for better creative direction.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──

interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  description: string;
  block_count: number;
  follower_count: number;
  creator: string;
  search_term: string;
  images: {
    block_id: number;
    title: string | null;
    description: string | null;
    image_url: string;
    thumb_url: string;
    source_url: string | null;
  }[];
  text_blocks: {
    block_id: number;
    title: string | null;
    content: string;
  }[];
}

interface BehanceProject {
  id: number;
  name: string;
  url: string;
  fields: { id: number; label: string }[];
  stats: { appreciations: { all: number }; views: { all: number } };
  covers: Record<string, { url: string }>;
  colors: { r: number; g: number; b: number };
  owners: { displayName: string }[];
  tags?: string[];
}

interface MatchedReference {
  source: 'arena' | 'behance';
  title: string;
  relevance_score: number;
  reason: string;
  image_urls: string[];  // sample images from this reference
  text_context: string;  // any descriptive text
  url?: string;
}

interface AnalysisContext {
  aesthetic_tags: string[];
  mood_tags: string[];
  color_descriptors: string[];
  era_references: string[];
  cultural_references: string[];
  photography_styles: string[];
  artist_names: string[];
  text_brief: string;
}

// ── Index Loading ──

let arenaIndex: ArenaChannel[] | null = null;
let behanceIndex: BehanceProject[] | null = null;

function getDataDir(): string {
  // Walk up from package to find project root
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'data', 'arena'))) return path.join(dir, 'data');
    dir = path.dirname(dir);
  }
  return path.join(__dirname, '..', '..', '..', 'data');
}

function loadArenaIndex(): ArenaChannel[] {
  if (arenaIndex) return arenaIndex;

  const dataDir = getDataDir();
  const channelDir = path.join(dataDir, 'arena', 'channels');
  if (!fs.existsSync(channelDir)) {
    console.log('No Are.na data found');
    return [];
  }

  const files = fs.readdirSync(channelDir).filter(f => f.endsWith('.json'));
  arenaIndex = files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(channelDir, f), 'utf-8'));
    } catch { return null; }
  }).filter(Boolean) as ArenaChannel[];

  console.log(`Loaded ${arenaIndex.length} Are.na channels`);
  return arenaIndex;
}

function loadBehanceIndex(): BehanceProject[] {
  if (behanceIndex) return behanceIndex;

  const dataDir = getDataDir();
  const apifyDir = path.join(dataDir, 'behance', 'apify');
  if (!fs.existsSync(apifyDir)) {
    console.log('No Behance data found');
    return [];
  }

  behanceIndex = [];
  const files = fs.readdirSync(apifyDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const items = JSON.parse(fs.readFileSync(path.join(apifyDir, f), 'utf-8'));
      if (Array.isArray(items)) behanceIndex.push(...items);
    } catch {}
  }

  console.log(`Loaded ${behanceIndex.length} Behance projects`);
  return behanceIndex;
}

// ── Matching Engine ──

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function scoreTerm(tokens: Set<string>, target: string): number {
  const targetTokens = tokenize(target);
  let hits = 0;
  for (const t of tokens) {
    for (const tt of targetTokens) {
      if (tt.includes(t) || t.includes(tt)) {
        hits++;
        break;
      }
    }
  }
  return hits / Math.max(tokens.size, 1);
}

function matchArenaChannels(context: AnalysisContext, maxResults: number = 8): MatchedReference[] {
  const channels = loadArenaIndex();
  if (channels.length === 0) return [];

  // Build search tokens from the analysis
  const allTerms = [
    ...context.aesthetic_tags,
    ...context.mood_tags,
    ...context.color_descriptors,
    ...context.era_references,
    ...context.cultural_references,
    ...context.photography_styles,
    ...context.artist_names,
    ...context.text_brief.split(/\s+/),
  ].filter(Boolean);

  const searchTokens = tokenize(allTerms.join(' '));

  // Score each channel
  const scored = channels.map(ch => {
    const channelText = [
      ch.title,
      ch.description,
      ch.search_term,
      ...ch.text_blocks.map(t => t.content || ''),
      ...ch.images.map(i => i.title || '').filter(Boolean),
    ].join(' ');

    const textScore = scoreTerm(searchTokens, channelText);
    // Boost by follower count (quality signal)
    const qualityBoost = Math.log2(Math.max(ch.follower_count, 1) + 1) / 10;
    // Boost by image count (more content = more useful)
    const contentBoost = Math.min(ch.images.length / 100, 0.2);

    return {
      channel: ch,
      score: textScore + qualityBoost + contentBoost,
    };
  }).filter(s => s.score > 0.05);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(s => ({
    source: 'arena' as const,
    title: s.channel.title,
    relevance_score: Math.min(s.score, 1),
    reason: `Are.na channel with ${s.channel.images.length} curated images (${s.channel.follower_count} followers)`,
    image_urls: s.channel.images.slice(0, 5).map(i => i.image_url).filter(Boolean),
    text_context: [
      s.channel.description,
      ...s.channel.text_blocks.slice(0, 2).map(t => t.content),
    ].filter(Boolean).join(' ').slice(0, 500),
    url: `https://www.are.na/channel/${s.channel.slug}`,
  }));
}

function matchBehanceProjects(context: AnalysisContext, maxResults: number = 8): MatchedReference[] {
  const projects = loadBehanceIndex();
  if (projects.length === 0) return [];

  const allTerms = [
    ...context.aesthetic_tags,
    ...context.mood_tags,
    ...context.cultural_references,
    ...context.photography_styles,
    ...context.artist_names,
    ...context.text_brief.split(/\s+/),
  ].filter(Boolean);

  const searchTokens = tokenize(allTerms.join(' '));

  const scored = projects.map(p => {
    const projectText = [
      p.name || '',
      ...(p.fields || []).map(f => f.label || ''),
      ...(p.tags || []),
    ].join(' ');

    const textScore = scoreTerm(searchTokens, projectText);
    const appreciations = p.stats?.appreciations?.all || 0;
    const qualityBoost = Math.log2(Math.max(appreciations, 1) + 1) / 20;

    return { project: p, score: textScore + qualityBoost };
  }).filter(s => s.score > 0.05);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(s => {
    const coverUrl = s.project.covers?.['size_808']?.url || 
                     s.project.covers?.['size_404']?.url ||
                     Object.values(s.project.covers || {})[0]?.url || '';
    return {
      source: 'behance' as const,
      title: s.project.name || `Project ${s.project.id}`,
      relevance_score: Math.min(s.score, 1),
      reason: `Behance project in ${(s.project.fields || []).map(f => f.label).join(', ')} (${s.project.stats?.appreciations?.all || 0} appreciations)`,
      image_urls: coverUrl ? [coverUrl] : [],
      text_context: '',
      url: s.project.url,
    };
  });
}

// ── Public API ──

export function findReferences(context: AnalysisContext, maxResults: number = 10): MatchedReference[] {
  const arenaMatches = matchArenaChannels(context, Math.ceil(maxResults * 0.6));
  const behanceMatches = matchBehanceProjects(context, Math.ceil(maxResults * 0.4));

  // Interleave and sort by score
  const all = [...arenaMatches, ...behanceMatches];
  all.sort((a, b) => b.relevance_score - a.relevance_score);
  return all.slice(0, maxResults);
}

export function buildReferenceContext(matches: MatchedReference[]): string {
  if (matches.length === 0) return '';

  const lines = [
    'CONTEXT FROM CREATIVE INTELLIGENCE ENGINE:',
    `Found ${matches.length} relevant reference collections from professional creative work:`,
    '',
  ];

  for (const match of matches.slice(0, 8)) {
    lines.push(`• "${match.title}" (${match.source === 'arena' ? 'Are.na' : 'Behance'}, relevance: ${(match.relevance_score * 100).toFixed(0)}%)`);
    if (match.reason) lines.push(`  ${match.reason}`);
    if (match.text_context) lines.push(`  Context: "${match.text_context.slice(0, 200)}"`);
  }

  lines.push('');
  lines.push('Use these references as creative precedent — they represent how professional creative directors');
  lines.push('have approached similar aesthetic territories. Draw on their patterns for color, typography,');
  lines.push('photography direction, and content frameworks, but create something original for this project.');

  return lines.join('\n');
}

/**
 * Extract matching context from a mood board analysis result.
 * Call this after analyzeMoodBoard() to get reference-enriched context.
 */
export function extractContextFromAnalysis(analysis: any): AnalysisContext {
  const synth = analysis?.synthesis || {};
  
  return {
    aesthetic_tags: (synth.aesthetic_profile?.tags || []).map((t: any) => t.tag || t),
    mood_tags: [
      synth.mood_profile?.primary_mood,
      ...(synth.mood_profile?.secondary_moods || []),
    ].filter(Boolean),
    color_descriptors: [
      synth.color_system?.color_story || '',
      ...(synth.color_system?.primary_palette || []).map((c: any) => c.name).filter(Boolean),
    ],
    era_references: (synth.cultural_mapping?.era_references || []).map((e: any) => e.era || e),
    cultural_references: [
      ...(synth.cultural_mapping?.subcultures || []).map((s: any) => s.name || s),
      ...(synth.cultural_mapping?.recognized_figures || []),
    ],
    photography_styles: [
      ...(synth.visual_language?.medium_preference || []),
      ...(synth.visual_language?.lighting_preference || []),
    ],
    artist_names: analysis?.artist_names || synth.artist_names || [],
    text_brief: analysis?.text_brief || '',
  };
}
