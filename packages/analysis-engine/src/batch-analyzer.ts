import Anthropic from '@anthropic-ai/sdk';
import { analyzeImage } from './image-analyzer';
import { ImageAnalysis, MoodBoardAnalysis } from './types';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Simple concurrency pool
async function pool<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e: any) {
        console.error(`  ✗ Image ${i + 1} failed: ${e.message}`);
        results[i] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const SYNTHESIS_PROMPT = `You are a world-class creative director analyzing a mood board. You have been given individual analyses of every image in the board, plus optional context (artist names, text brief, audio references).

Synthesize everything into a unified creative direction. Return ONLY valid JSON matching this schema:

{
  "manifesto": "1-3 sentence creative anchor statement",
  "narrative": "500-1000 word creative direction narrative",
  "color_system": {
    "primary_palette": [{"hex": "#RRGGBB", "weight": 0.0-1.0}],
    "accent_colors": [{"hex": "#RRGGBB", "weight": 0.0-1.0}],
    "temperature": -1.0 to 1.0,
    "saturation": 0.0-1.0,
    "brightness": 0.0-1.0,
    "color_story": "2-3 sentences about what the colors mean"
  },
  "aesthetic_profile": {
    "tags": [{"tag": "string", "weight": 0.0-1.0}],
    "description": "narrative description of the aesthetic"
  },
  "mood_profile": {
    "primary_mood": "one mood word",
    "secondary_moods": ["mood", "words"],
    "energy": 0.0-1.0,
    "tension": 0.0-1.0,
    "warmth": 0.0-1.0,
    "mood_arc": "description of emotional journey"
  },
  "visual_language": {
    "dominant_framing": ["types"],
    "lighting_preference": ["types"],
    "texture_vocabulary": ["descriptors"],
    "medium_preference": ["types"],
    "density": 0.0-1.0,
    "negative_space": 0.0-1.0,
    "realism": 0.0-1.0,
    "post_processing": 0.0-1.0
  },
  "subject_analysis": {
    "people_ratio": 0.0-1.0,
    "environment_ratio": 0.0-1.0,
    "object_ratio": 0.0-1.0,
    "abstract_ratio": 0.0-1.0,
    "gaze_patterns": [{"pattern": "string", "frequency": 0.0-1.0}],
    "body_language_patterns": [{"pattern": "string", "frequency": 0.0-1.0}],
    "solo_vs_group": 0.0-1.0,
    "studio_vs_location": 0.0-1.0
  },
  "cultural_mapping": {
    "era_references": [{"era": "string", "frequency": 0.0-1.0}],
    "subcultures": [{"name": "string", "strength": 0.0-1.0}],
    "recognized_figures": ["names"],
    "geographic_signals": [{"location": "string", "strength": 0.0-1.0}],
    "graph_node_matches": [{"id": "kebab-case-id", "label": "NodeLabel", "score": 0.0-1.0}]
  },
  "contradictions": ["detected tensions in the board"],
  "unique_qualities": ["what makes this board distinctive"],
  "touchpoints": {
    "photography": "2+ sentences on campaign photography direction",
    "music_video": "2+ sentences on music video treatment/direction",
    "short_form_video": "2+ sentences on TikTok/Reels/Shorts direction",
    "long_form_video": "2+ sentences on YouTube/BTS/documentary content",
    "lyric_visualizer": "2+ sentences on lyric video and visualizer direction",
    "live_capture": "2+ sentences on live performance capture style",
    "album_art": "2+ sentences on album cover artwork direction",
    "single_covers": "2+ sentences on single cover artwork direction",
    "packaging": "2+ sentences on vinyl, CD, and physical packaging direction",
    "merchandise_tees": "2+ sentences on t-shirt design direction",
    "merchandise_hoodies": "2+ sentences on hoodie design direction",
    "merchandise_hats": "2+ sentences on hat design direction",
    "merchandise_accessories": "2+ sentences on accessories design direction",
    "stage_design": "2+ sentences on stage design and backdrops",
    "lighting_direction": "2+ sentences on lighting direction for live shows",
    "tour_visuals": "2+ sentences on tour visual content",
    "logo_identity": "2+ sentences on project/artist logo direction",
    "typography": "2+ sentences on type treatment direction",
    "color_system_notes": "2+ sentences expanding on the color system application",
    "tour_flyers": "2+ sentences on tour flyer and poster design",
    "tour_ads": "2+ sentences on advertisement assets",
    "styling_artist": "2+ sentences on wardrobe/styling for the artist",
    "styling_others": "2+ sentences on styling direction for anyone else involved",
    "content_direction": "2+ sentences on general content direction",
    "brand_partnerships": "2+ sentences on types of brands that align",
    "social_content": "2+ sentences on social media content direction"
  }
}

For graph_node_matches, reference these known cultural entities by their kebab-case IDs when relevant:
Artists: fka-twigs, charli-xcx, rose, tyler-the-creator, frank-ocean, solange, pinkpantheress, skrillex, turnstile, doja-cat, alex-warren, fred-again
Photographers: harley-weir, petra-collins
Directors: hype-williams, andrew-thomas-huang
Stylists: lotta-volkova
Brands: comme-des-garcons, margiela, rick-owens
Cities: tokyo, london, los-angeles
Scenes: boiler-room
Aesthetics: brutalism

CREATIVE DIRECTION METHODOLOGY (from a 10-year veteran creative director at a major label):

Culture + Context Framework:
- "Where in culture are we tapping into?"
- "What niche group is our superfans? What trends are we riding or dodging?"
- "Do we live in this culture or do we have to find a way in?"
- "What's the context that's gotten us to this point?"
- "Culture and context define how, where, and why we exist in the world."

Writing Rules:
- Headlines and the first sentence are the most important. Nail them.
- Be heavy on vision, light on text. Every word must earn its place.
- When writing touchpoints, write like a creative brief — direct, opinionated, specific.
- Use bold declarative statements, not hedging. "We shoot on 35mm film" not "Consider using film."
- Reference specific cultural touchpoints, photographers, directors, aesthetics by name.
- The manifesto should feel like a creative anthem — something you'd say in a room to get everyone excited.
- The narrative should read like a magazine feature about the visual world, not a report.

Color Principles:
- Avoid true black (#000) and true white (#fff) — use slight tints. Near-black (#111, #1a1a1a) and off-white (#f5f0e8).
- Single accent color approach — one bold color, rest is neutral.
- Color should feel pulled from real materials (film, fabric, landscape), not digital gradients.

Image/Visual Direction:
- "Image choice is 80% of slide design."
- "When everything is big, nothing is. Make things feel big by making other things small."
- Reference specific photographers, directors, and visual styles by name when giving touchpoint direction.
- Think about the artist existing in a world, not just posing. Where are they? What are they doing? What does it smell like?

Be bold and specific in your creative direction. Write like a top creative director pitching to an artist — confident, opinionated, culturally fluent. Not like an AI.`;

export async function analyzeMoodBoard(
  images: (Buffer | string)[],
  options?: {
    concurrency?: number;
    artistNames?: string[];
    textBrief?: string;
    spotifyTrackIds?: string[];
    youtubeUrls?: string[];
  }
): Promise<MoodBoardAnalysis> {
  const concurrency = options?.concurrency ?? 10;

  console.log(`Analyzing ${images.length} images with concurrency ${concurrency}...`);

  // Analyze all images
  const results = await pool(
    images,
    async (img, i) => {
      console.log(`  ✓ Image ${i + 1}/${images.length}`);
      return analyzeImage(img);
    },
    concurrency
  );

  const validAnalyses = results.filter((r): r is ImageAnalysis => r !== null);
  console.log(`\n${validAnalyses.length}/${images.length} images analyzed successfully`);

  // Build context for synthesis
  let contextText = '';
  if (options?.artistNames?.length) {
    contextText += `\nArtist references: ${options.artistNames.join(', ')}`;
  }
  if (options?.textBrief) {
    contextText += `\nCreative brief: ${options.textBrief}`;
  }

  // ── Reference Engine: find similar professional creative work ──
  let referenceContext = '';
  try {
    const { findReferences, buildReferenceContext, extractContextFromAnalysis } = require('./reference-engine');
    
    // Build a preliminary context from the raw analyses
    const prelimContext = {
      aesthetic_tags: [] as string[],
      mood_tags: [] as string[],
      color_descriptors: [] as string[],
      era_references: [] as string[],
      cultural_references: [] as string[],
      photography_styles: [] as string[],
      artist_names: options?.artistNames || [],
      text_brief: options?.textBrief || '',
    };

    // Extract common tags from individual analyses
    for (const a of validAnalyses.slice(0, 20)) {
      if (a.mood?.primary) prelimContext.mood_tags.push(a.mood.primary);
      if (a.mood?.secondary) prelimContext.mood_tags.push(a.mood.secondary);
      if (a.cultural?.era) prelimContext.era_references.push(a.cultural.era);
      if (a.cultural?.subcultures) prelimContext.cultural_references.push(...a.cultural.subcultures);
      if (a.texture?.medium) prelimContext.photography_styles.push(a.texture.medium);
      if (a.texture?.descriptors) prelimContext.aesthetic_tags.push(...a.texture.descriptors);
    }

    const matches = findReferences(prelimContext, 8);
    if (matches.length > 0) {
      referenceContext = buildReferenceContext(matches);
      console.log(`Found ${matches.length} reference matches from intelligence engine`);
    }
  } catch (e: any) {
    console.log('Reference engine not available:', e.message);
  }

  // Send all analyses to Claude for synthesis
  console.log('Synthesizing creative direction...');
  const anthropic = getClient();

  const synthesisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16384,
    system: SYNTHESIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here are the individual analyses of ${validAnalyses.length} mood board images:\n\n${JSON.stringify(validAnalyses.map(a => ({
          color: { dominant_colors: a.color.dominant_colors.slice(0, 3), temperature: a.color.temperature },
          mood: a.mood,
          cultural: a.cultural,
          composition: { framing: a.composition.framing },
          texture: { medium: a.texture.medium, descriptors: a.texture.descriptors },
          subject: { primary_type: a.subject.primary_type, setting: a.subject.setting },
        })), null, 0)}\n${contextText}${referenceContext ? '\n\n' + referenceContext : ''}\n\nSynthesize this into a unified creative direction. Return the JSON.`,
      },
    ],
  });

  const textContent = synthesisResponse.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No synthesis response from Claude');
  }

  let jsonStr = textContent.text.trim();
  // Extract JSON from markdown fencing or surrounding text
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // If there's a fenced block anywhere in the response, extract it
  const fencedMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  }
  // If JSON doesn't start with { or [, find the first { or [
  if (!/^\s*[{\[]/.test(jsonStr)) {
    const firstBrace = jsonStr.indexOf('{');
    const firstBracket = jsonStr.indexOf('[');
    const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
    if (start >= 0) jsonStr = jsonStr.substring(start);
  }
  // Trim trailing text after the last } or ]
  const lastBrace = jsonStr.lastIndexOf('}');
  const lastBracket = jsonStr.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end >= 0 && end < jsonStr.length - 1) {
    jsonStr = jsonStr.substring(0, end + 1);
  }

  // If response was truncated (hit max_tokens), try to repair JSON
  let synthesis: any;
  try {
    synthesis = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn('JSON parse failed, attempting repair...');
    // Close any open strings, arrays, objects
    let repaired = jsonStr;
    // Count open brackets/braces
    const opens = (repaired.match(/[{[]/g) || []).length;
    const closes = (repaired.match(/[}\]]/g) || []).length;
    // If inside a string, close it
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) repaired += '"';
    // Close remaining brackets
    for (let i = 0; i < opens - closes; i++) {
      // Guess based on last opener
      repaired += repaired.lastIndexOf('[') > repaired.lastIndexOf('{') ? ']' : '}';
    }
    try {
      synthesis = JSON.parse(repaired);
      console.log('JSON repair succeeded');
    } catch {
      throw new Error(`Synthesis JSON could not be parsed or repaired. Response length: ${jsonStr.length} chars. Stop reason: ${synthesisResponse.stop_reason}`);
    }
  }

  // Build the full MoodBoardAnalysis
  const analysis: MoodBoardAnalysis = {
    images: validAnalyses,
    image_count: validAnalyses.length,
    synthesis: {
      manifesto: synthesis.manifesto || '',
      narrative: synthesis.narrative || '',
      color_system: synthesis.color_system || {
        primary_palette: [], accent_colors: [],
        temperature: 0, saturation: 0.5, brightness: 0.5,
        color_story: '',
      },
      aesthetic_profile: synthesis.aesthetic_profile || { tags: [], description: '' },
      mood_profile: synthesis.mood_profile || {
        primary_mood: 'mysterious', secondary_moods: [],
        energy: 0.5, tension: 0.5, warmth: 0.5, mood_arc: '',
      },
      visual_language: synthesis.visual_language || {
        dominant_framing: [], lighting_preference: [],
        texture_vocabulary: [], medium_preference: [],
        density: 0.5, negative_space: 0.5, realism: 0.5, post_processing: 0.5,
      },
      subject_analysis: synthesis.subject_analysis || {
        people_ratio: 0, environment_ratio: 0, object_ratio: 0, abstract_ratio: 0,
        gaze_patterns: [], body_language_patterns: [],
        solo_vs_group: 0.5, studio_vs_location: 0.5,
      },
      cultural_mapping: synthesis.cultural_mapping || {
        era_references: [], subcultures: [], recognized_figures: [],
        geographic_signals: [], graph_node_matches: [],
      },
      contradictions: synthesis.contradictions || [],
      unique_qualities: synthesis.unique_qualities || [],
    },
    graph_position: {
      nearest_nodes: (synthesis.cultural_mapping?.graph_node_matches || []).map((m: any) => ({
        id: m.id,
        label: m.label,
        distance: 1 - (m.score || 0),
      })),
      aesthetic_vector: [],
      cultural_territory: synthesis.aesthetic_profile?.description || '',
    },
    touchpoints: synthesis.touchpoints || {
      album_art: '', music_video: '', photography: '',
      merchandise: '', stage_design: '', social_content: '',
      brand_partnerships: '', typography: '', styling: '',
    },
    recommended_talent: {
      photographers: [],
      directors: [],
      stylists: [],
    },
  };

  console.log('✅ Mood board analysis complete');
  return analysis;
}
