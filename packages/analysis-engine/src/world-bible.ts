import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * The World Bible is a structured constraint document that sits between
 * synthesis and image generation. It's not a creative brief — it's a
 * literal set of visual rules that every prompt inherits from.
 *
 * Think of it like a cinematographer's look book: specific, measurable,
 * consistent across every surface.
 */
export interface WorldBible {
  // ── LIGHT ──
  lightDirection: string;        // e.g. "top-left, 45 degrees, motivated by window"
  lightQuality: string;          // e.g. "soft diffused, no hard shadows"
  lightTemperature: string;      // e.g. "warm 3200K tungsten"
  shadowBehavior: string;        // e.g. "deep but transparent, never crushed to pure black"

  // ── COLOR ──
  palette: string[];             // exact hex values
  dominantColor: string;         // the one color that owns the campaign
  forbiddenColors: string[];     // colors that break the world
  saturationRange: string;       // e.g. "desaturated, 30-50% of full"
  contrastLevel: string;         // e.g. "medium-low, lifted blacks, no true white"

  // ── TEXTURE ──
  filmStock: string;             // e.g. "Kodak Portra 400 — warm, soft grain"
  grainLevel: string;            // e.g. "visible but not dominant, fine grain"
  skinTexture: string;           // e.g. "visible pores, no airbrushing, real skin"
  surfaceQuality: string;        // e.g. "matte everything, no gloss or sheen"

  // ── FRAMING ──
  defaultAspectRatio: string;    // e.g. "3:2 horizontal, 4:5 for portraits"
  preferredFraming: string;      // e.g. "center-weighted, medium shots, negative space left"
  depthOfField: string;          // e.g. "shallow, f/1.8-2.8, background soft"
  cameraHeight: string;          // e.g. "eye level, never looking down on the artist"

  // ── ENVIRONMENT ──
  worldDescription: string;      // 2-3 sentence description of where this artist exists
  timeOfDay: string;             // e.g. "golden hour into blue hour"
  interiorExterior: string;      // e.g. "mostly interior, industrial spaces"
  materialPalette: string[];     // e.g. ["raw concrete", "worn leather", "oxidized metal"]

  // ── TYPOGRAPHY ──
  typographyStyle: string;       // e.g. "condensed grotesque, all caps, tight tracking"
  typePlacement: string;         // e.g. "lower third, left-aligned, never centered"
  typeColor: string;             // e.g. "off-white on dark, knock-out only"

  // ── FASHION / WARDROBE ──
  fashionEra: string;            // e.g. "late 90s workwear meets Y2K utility"
  fabricLanguage: string;        // e.g. "heavyweight cotton, raw denim, waxed canvas — no synthetics"
  silhouette: string;            // e.g. "oversized tops, straight-leg bottoms, layered"
  colorRelationship: string;     // e.g. "tonal dressing — head-to-toe in palette, no contrast dressing"

  // ── BODY / POSE / EXPRESSION ──
  posePhilosophy: string;        // e.g. "never posed, always caught — mid-motion, looking away, hands busy"
  emotionalRegister: string;     // e.g. "quiet confidence, no performance, internal not external"
  eyeContact: string;            // e.g. "rarely direct to camera, mostly looking off-frame or down"

  // ── PROPS / OBJECTS ──
  objectPalette: string[];       // e.g. ["vintage cameras", "cigarettes", "worn paperbacks", "analog phones"]
  objectPhilosophy: string;      // e.g. "every object has history — nothing new, nothing pristine"

  // ── ERA / TIME ──
  eraReference: string;          // e.g. "1973-1978 New York, 2004 Tokyo, present-day rural Texas"
  temporalFeel: string;          // e.g. "timeless but specific — could be now or 30 years ago"

  // ── CAMERA / PHOTOGRAPHY STYLE ──
  lensCharacter: string;         // e.g. "vintage glass, slight softness wide open, character flares"
  shootingStyle: string;         // e.g. "reportage — fast, available light, no second takes"
  printQuality: string;          // e.g. "darkroom print — slightly cool blacks, edge burn, hand-printed feel"

  // ── CULTURAL REFERENCE POINTS ──
  culturalTouchstones: string[]; // e.g. ["Larry Clark", "Nan Goldin", "Sofia Coppola", "A24 films"]
  musicalAnalog: string;         // e.g. "if this campaign had a soundtrack: Mazzy Star, Portishead, early Radiohead"

  // ── SOUND TRANSLATION ──
  soundToVisual: string;         // e.g. "the reverb becomes fog, the bass becomes shadow weight, the silence becomes negative space"

  // ── ANTI ──
  neverList: string[];           // explicit list of things that break the world

  // ── RAW ──
  fullConstraintText: string;    // the complete constraint block for prompt injection
}

const WORLD_BIBLE_PROMPT = `You are a cinematographer and visual director creating a "world bible" — a strict set of visual rules for a creative campaign. This is NOT a creative brief. It's a constraint document. Every image generated for this campaign must follow these rules exactly.

You will receive the creative synthesis (manifesto, color system, aesthetic profile, mood, visual language, cultural mapping). Extract specific, measurable, enforceable visual rules.

Return ONLY valid JSON matching this schema:

{
  "lightDirection": "specific direction and motivation",
  "lightQuality": "hard/soft, diffused/direct, specific quality",
  "lightTemperature": "specific Kelvin range or color temperature",
  "shadowBehavior": "how shadows behave — depth, transparency, crush point",
  
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "dominantColor": "#hex — the single color that owns this campaign",
  "forbiddenColors": ["#hex or description of colors that break the world"],
  "saturationRange": "specific range description",
  "contrastLevel": "specific contrast behavior",
  
  "filmStock": "specific film stock or digital look equivalent",
  "grainLevel": "specific grain description",
  "skinTexture": "how skin should appear — pores, sheen, treatment",
  "surfaceQuality": "matte/glossy/textured — how surfaces feel",
  
  "defaultAspectRatio": "specific ratio for different contexts",
  "preferredFraming": "composition rules",
  "depthOfField": "specific aperture behavior",
  "cameraHeight": "specific camera position relative to subject",
  
  "worldDescription": "2-3 sentences: WHERE does this artist exist? What does it smell like? What's the air like?",
  "timeOfDay": "specific time range",
  "interiorExterior": "preference and specific space types",
  "materialPalette": ["material1", "material2", "material3", "material4"],
  
  "typographyStyle": "specific type treatment rules",
  "typePlacement": "where and how type appears",
  "typeColor": "type color rules",

  "fashionEra": "specific era/movement for wardrobe",
  "fabricLanguage": "specific fabrics and materials — what the artist wears",
  "silhouette": "body shape and proportions in clothing",
  "colorRelationship": "how wardrobe colors relate to palette",

  "posePhilosophy": "how the artist holds their body — rules for posing",
  "emotionalRegister": "emotional temperature — what the face and body communicate",
  "eyeContact": "rules for where the artist looks",

  "objectPalette": ["prop1", "prop2", "prop3", "prop4"],
  "objectPhilosophy": "rules for objects in frame — new vs worn, specific vs generic",

  "eraReference": "specific decade(s) and location(s) this world references",
  "temporalFeel": "relationship to time — nostalgic, futuristic, timeless, specific moment",

  "lensCharacter": "specific lens qualities — vintage glass, clinical modern, etc.",
  "shootingStyle": "how the photographer works — reportage, controlled, spontaneous",
  "printQuality": "how the final image feels as a print — darkroom, digital, inkjet, etc.",

  "culturalTouchstones": ["reference artist/filmmaker/photographer 1", "reference 2", "reference 3"],
  "musicalAnalog": "if this campaign had a soundtrack, what would it sound like",

  "soundToVisual": "how the artist's sound translates to visual language — reverb=fog, bass=shadow, etc.",

  "neverList": ["specific thing to never do 1", "specific thing 2", "specific thing 3", "at least 8 items"]
}

Be SPECIFIC. Not "warm lighting" but "3200K tungsten, motivated by practical lamps, no overhead fluorescent." Not "film grain" but "Kodak Portra 400 grain structure — visible in shadows, dissolves in highlights." Not "desaturated" but "40% saturation, warm bias, no pure primaries."

The neverList should have at least 8 items and include both visual rules (no HDR, no lens flare) and contextual rules (no generic studio backgrounds, no stock photo poses).`;

export async function generateWorldBible(synthesis: any): Promise<WorldBible> {
  const anthropic = getClient();
  console.log('Generating world bible...');

  const context = JSON.stringify({
    manifesto: synthesis.manifesto,
    color_system: synthesis.color_system,
    aesthetic_profile: synthesis.aesthetic_profile,
    mood_profile: synthesis.mood_profile,
    visual_language: synthesis.visual_language,
    cultural_mapping: {
      era_references: synthesis.cultural_mapping?.era_references,
      subcultures: synthesis.cultural_mapping?.subcultures,
    },
  }, null, 2);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: WORLD_BIBLE_PROMPT,
    messages: [{
      role: 'user',
      content: `Generate the world bible from this creative synthesis:\n\n${context}`,
    }],
  });

  const textContent = response.content.find((c: any) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') throw new Error('No world bible response');

  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  // Build the full constraint text block that gets injected into every prompt
  const constraintBlock = buildConstraintBlock(parsed);
  parsed.fullConstraintText = constraintBlock;

  console.log(`✅ World bible generated (${parsed.neverList?.length || 0} constraints in never-list)`);
  return parsed as WorldBible;
}

function buildConstraintBlock(bible: any): string {
  // COMPACT world bible — only the essentials that affect visual identity.
  // Over-specifying makes Gemini produce hyper-perfect AI-looking images.
  // Let the reference images do the heavy lifting. Text just sets guardrails.
  const palette = (bible.palette || []).slice(0, 4).join(', ');
  const nevers = (bible.neverList || []).slice(0, 5).join('. ');
  const refs = (bible.culturalTouchstones || []).slice(0, 3).join(', ');

  const lines: string[] = [
    `VISUAL RULES:`,
    `Light: ${bible.lightQuality || bible.lightDirection}. ${bible.lightTemperature}.`,
    `Palette: ${palette}. ${bible.saturationRange}.`,
    `Film: ${bible.filmStock}. ${bible.grainLevel}.`,
    `World: ${bible.worldDescription}.`,
    `Ref photographers: ${refs}.`,
    `NEVER: ${nevers}.`,
  ];
  return lines.join(' ');
}

// Full verbose block — stored for reference/export but NOT injected into image prompts
function buildFullConstraintBlock(bible: any): string {
  const lines: string[] = [
    'WORLD BIBLE — FULL REFERENCE:',
    `LIGHT: ${bible.lightDirection}. ${bible.lightQuality}. Temperature: ${bible.lightTemperature}. Shadows: ${bible.shadowBehavior}.`,
    `COLOR: Dominant ${bible.dominantColor}. Palette: ${(bible.palette || []).join(', ')}. Saturation: ${bible.saturationRange}. Contrast: ${bible.contrastLevel}. FORBIDDEN: ${(bible.forbiddenColors || []).join(', ')}.`,
    `TEXTURE: ${bible.filmStock}. Grain: ${bible.grainLevel}. Skin: ${bible.skinTexture}. Surfaces: ${bible.surfaceQuality}.`,
    `CAMERA: ${bible.preferredFraming}. DoF: ${bible.depthOfField}. Height: ${bible.cameraHeight}. Lens: ${bible.lensCharacter || 'n/a'}. Style: ${bible.shootingStyle || 'n/a'}.`,
    `WORLD: ${bible.worldDescription}. Time: ${bible.timeOfDay}. Setting: ${bible.interiorExterior}. Materials: ${(bible.materialPalette || []).join(', ')}. Era: ${bible.eraReference || 'n/a'}.`,
    `FASHION: ${bible.fashionEra || 'n/a'}. Fabrics: ${bible.fabricLanguage || 'n/a'}. Silhouette: ${bible.silhouette || 'n/a'}. Color relationship: ${bible.colorRelationship || 'n/a'}.`,
    `BODY: ${bible.posePhilosophy || 'n/a'}. Emotion: ${bible.emotionalRegister || 'n/a'}. Eyes: ${bible.eyeContact || 'n/a'}.`,
    `PROPS: ${(bible.objectPalette || []).join(', ')}. ${bible.objectPhilosophy || ''}`,
    `REFERENCES: ${(bible.culturalTouchstones || []).join(', ')}. Sound→Visual: ${bible.soundToVisual || 'n/a'}.`,
    `NEVER: ${(bible.neverList || []).join('. ')}.`,
  ];
  return lines.join('\n');
}
