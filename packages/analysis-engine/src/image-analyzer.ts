import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ImageAnalysis } from './types';

const MOOD_VOCABULARY = [
  'melancholic', 'euphoric', 'aggressive', 'serene', 'sensual',
  'playful', 'mysterious', 'anxious', 'confident', 'vulnerable',
  'rebellious', 'nostalgic', 'ethereal', 'raw', 'joyful',
  'somber', 'electric', 'sacred', 'chaotic', 'intimate',
] as const;

const SYSTEM_PROMPT = `You are a visual culture analyst. You will analyze an image and return a structured JSON object. Be precise, culturally informed, and specific.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):

{
  "color": {
    "dominant_colors": [{"hex": "#RRGGBB", "weight": 0.0-1.0}],  // Top 5, weights sum to 1.0
    "temperature": -1.0 to 1.0,  // -1=cool, 1=warm
    "saturation": 0.0-1.0,
    "brightness": 0.0-1.0,
    "harmony_type": "complementary|analogous|monochromatic|triadic|split-complementary"
  },
  "composition": {
    "framing": "close-up|medium|wide|extreme-wide|overhead|low-angle|dutch-angle",
    "rule_of_thirds": 0.0-1.0,
    "symmetry": 0.0-1.0,
    "depth_of_field": "shallow|medium|deep",
    "focal_point": {"x": 0.0-1.0, "y": 0.0-1.0},
    "negative_space": 0.0-1.0
  },
  "lighting": {
    "type": "natural|studio|neon|candlelight|golden-hour|blue-hour|overcast|flash|mixed",
    "direction": "front|side|back|overhead|under",
    "contrast": 0.0-1.0,
    "shadow_quality": "hard|soft|absent",
    "color_cast": "warm|cool|neutral|tinted"
  },
  "texture": {
    "medium": "film-photography|digital|painting|illustration|collage|3D-render|mixed-media|screen-capture",
    "grain": 0.0-1.0,
    "post_processing": 0.0-1.0,
    "retouching": 0.0-1.0,
    "descriptors": ["glossy","matte","rough","smooth","organic","synthetic","metallic","fabric"]
  },
  "subject": {
    "primary_type": "person|group|landscape|architecture|object|abstract|text-graphic|product",
    "count": int,
    "gaze": "camera|away|closed|obscured|N/A",
    "body_language": "confrontational|relaxed|performative|natural|sculptural|dynamic|N/A",
    "skin_tones": ["descriptors"],
    "clothing": ["items visible"],
    "brands": ["identified brands"],
    "setting": "studio|interior|exterior-urban|exterior-natural|surreal|composite"
  },
  "mood": {
    "primary": one of [${MOOD_VOCABULARY.join(', ')}],
    "secondary": one of [${MOOD_VOCABULARY.join(', ')}],
    "energy": 0.0-1.0,
    "intimacy": 0.0-1.0,
    "tension": 0.0-1.0,
    "warmth": 0.0-1.0
  },
  "cultural": {
    "era": "50s|60s|70s|80s|90s|2000s|2010s|2020s|futuristic|timeless",
    "subcultures": ["tags"],
    "art_movements": ["references"],
    "recognized_figures": ["names if identifiable"],
    "geographic_indicators": ["locations"]
  },
  "typography": {
    "has_text": boolean,
    "text_content": "string or null",
    "font_style": "serif|sans-serif|handwritten|display|distressed|futuristic|N/A",
    "graphic_elements": ["logo","icon","pattern","illustration","border","overlay"]
  },
  "technical": {
    "quality": "low|medium|high",
    "aspect_ratio": "square|portrait|landscape|cinematic|vertical-mobile",
    "is_screenshot": boolean,
    "is_collage": boolean,
    "estimated_era": "string"
  }
}

IMPORTANT:
- All hex colors must be valid 7-character strings (#RRGGBB)
- All float values must be within specified ranges
- Mood primary and secondary MUST be from the controlled vocabulary
- Return texture.descriptors as array picking from: glossy, matte, rough, smooth, organic, synthetic, metallic, fabric
- Return ONLY the JSON object, no other text`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

async function imageToBase64(image: Buffer | string): Promise<{ data: string; mediaType: string }> {
  let buffer: Buffer;

  if (Buffer.isBuffer(image)) {
    buffer = image;
  } else if (image.startsWith('http://') || image.startsWith('https://')) {
    const response = await fetch(image);
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (image.startsWith('data:')) {
    const matches = image.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      return { data: matches[2], mediaType: matches[1] };
    }
    throw new Error('Invalid data URI');
  } else {
    // File path
    buffer = fs.readFileSync(image);
  }

  // Detect media type from buffer magic bytes
  let mediaType = 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) mediaType = 'image/png';
  else if (buffer[0] === 0x47 && buffer[1] === 0x49) mediaType = 'image/gif';
  else if (buffer[0] === 0x52 && buffer[1] === 0x49) mediaType = 'image/webp';

  return { data: buffer.toString('base64'), mediaType };
}

function validateAnalysis(analysis: any): ImageAnalysis {
  // Validate mood vocabulary
  if (!MOOD_VOCABULARY.includes(analysis.mood?.primary)) {
    analysis.mood.primary = 'mysterious'; // safe fallback
  }
  if (!MOOD_VOCABULARY.includes(analysis.mood?.secondary)) {
    analysis.mood.secondary = 'intimate';
  }

  // Clamp numeric values
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  if (analysis.color) {
    analysis.color.temperature = clamp(analysis.color.temperature ?? 0, -1, 1);
    analysis.color.saturation = clamp(analysis.color.saturation ?? 0.5, 0, 1);
    analysis.color.brightness = clamp(analysis.color.brightness ?? 0.5, 0, 1);

    // Validate hex colors
    analysis.color.dominant_colors = (analysis.color.dominant_colors || []).map((c: any) => ({
      hex: /^#[0-9A-Fa-f]{6}$/.test(c.hex) ? c.hex : '#808080',
      weight: clamp(c.weight ?? 0.2, 0, 1),
    }));
  }

  // Clamp all 0-1 floats
  const clampFields = [
    ['composition', 'rule_of_thirds'],
    ['composition', 'symmetry'],
    ['composition', 'negative_space'],
    ['lighting', 'contrast'],
    ['texture', 'grain'],
    ['texture', 'post_processing'],
    ['texture', 'retouching'],
    ['mood', 'energy'],
    ['mood', 'intimacy'],
    ['mood', 'tension'],
    ['mood', 'warmth'],
  ];

  for (const [section, field] of clampFields) {
    if (analysis[section] && typeof analysis[section][field] === 'number') {
      analysis[section][field] = clamp(analysis[section][field], 0, 1);
    }
  }

  // Ensure arrays exist
  const arrayFields = [
    ['texture', 'descriptors'],
    ['subject', 'skin_tones'],
    ['subject', 'clothing'],
    ['subject', 'brands'],
    ['cultural', 'subcultures'],
    ['cultural', 'art_movements'],
    ['cultural', 'recognized_figures'],
    ['cultural', 'geographic_indicators'],
    ['typography', 'graphic_elements'],
  ];

  for (const [section, field] of arrayFields) {
    if (analysis[section] && !Array.isArray(analysis[section][field])) {
      analysis[section][field] = [];
    }
  }

  return analysis as ImageAnalysis;
}

export async function analyzeImage(
  image: Buffer | string,
  options?: {
    detail?: 'standard' | 'deep';
  }
): Promise<ImageAnalysis> {
  const anthropic = getClient();
  const { data, mediaType } = await imageToBase64(image);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as any,
              data,
            },
          },
          {
            type: 'text',
            text: options?.detail === 'deep'
              ? 'Analyze this image in deep detail. Be thorough and precise with every field.'
              : 'Analyze this image. Return the complete JSON analysis.',
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON - handle potential markdown wrapping
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);
  return validateAnalysis(parsed);
}
