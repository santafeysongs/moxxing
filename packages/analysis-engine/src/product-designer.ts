import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface ProductItem {
  name: string;
  category: 'apparel' | 'headwear' | 'accessory' | 'lifestyle' | 'music_format';
  description: string;
  colorway: string;
  keyDetail: string;
  isHeroItem: boolean;
  priceRange?: 'value' | 'mid' | 'premium' | 'luxury';
}

export interface ProductSection {
  items: ProductItem[];
  overviewNarrative: string;
}

const PRODUCT_PROMPT = `You are a product design director with deep knowledge of music culture, streetwear, fashion, and fan products trends. You are generating product design concepts for a campaign. These ideas must be SPECIFIC and CULTURALLY INFORMED. Every item should feel like it belongs in THIS artist's world, not on a generic product template.

RULES:
1. DO NOT default to "t-shirt, hoodie, hat, tote bag, poster." Every item must be justified by the creative direction, the genre, or the artist's identity.

2. Items should reflect CURRENT TRENDS in the artist's genre and subculture. Consider:
   - What silhouettes and fits are trending in this world right now?
   - What brands is this audience already wearing?
   - What non-apparel items are culturally relevant? (lighters, rolling papers, incense, mini backpacks, phone cases, keychains, jewelry, patches, zines, candles, blankets, etc.)
   - What's happening at product displays for similar artists right now?

3. Items should be INSPIRED BY THE CREATIVE DIRECTION:
   - If the campaign has a specific visual motif, how does it translate to a physical product?
   - If the manifesto has a key phrase, where does it appear on merch?
   - If there's a color palette, how do the items use those colors?
   - If there's a specific photography style, does that suggest a photo tee, a zine, a poster series?

4. Items should reflect THE ARTIST'S ACTUAL IDENTITY:
   - If the artist plays guitar → guitar picks, guitar straps
   - If the artist is known for smoking → lighters, rolling trays, rolling papers, ash trays
   - If the artist has a signature accessory → merch version of it
   - If the artist has a catchphrase → where does it show up?
   - If the artist's fans have a name or identity → fan-specific items

5. Consider the BRAND REFERENCES when describing items:
   - If references include Chrome Hearts → merch should have that heavy, gothic, handmade jewelry energy
   - If references include Carhartt → workwear cuts, heavyweight cotton, utility details
   - If references include Skims → bodycon fits, neutral tones, second-skin fabrics
   - The brand references tell you the TASTE LEVEL and WORLD the merch lives in

6. Be specific about DETAILS that matter:
   - Hat style: dad hat, trucker, fitted, bucket, beanie, balaclava
   - Shirt cut: boxy, oversized, cropped, baby tee, raglan, henley
   - Print method (ONLY when it matters to the aesthetic): screen print, embroidery, puff print, distressed/vintage wash, DTG, sublimation, patch
   - Colorway: use the campaign palette, describe the specific color application
   - Graphic placement: front chest, back, sleeve, all-over, hem tag, inside collar
   - Logo treatment: how the artist's name/logo appears, informed by the typography direction

7. NON-APPAREL items are often the most creative and culturally specific. Always include at least 2-3 non-apparel items.

8. Generate 6-10 items:
   - 3-4 apparel items (specific cuts and styles)
   - 1-2 headwear/accessories
   - 2-3 non-apparel lifestyle items
   - 1 "hero item" — the most creative, campaign-specific piece (flag isHeroItem: true)

The hero item is the conversation starter, the thing that's different from what every other artist sells.

Return ONLY valid JSON matching this schema:
{
  "overviewNarrative": "2-3 sentences connecting the product line to the campaign's creative world",
  "items": [
    {
      "name": "Specific item name — not just 'T-Shirt'",
      "category": "apparel | headwear | accessory | lifestyle | music_format",
      "description": "2-3 sentences. What it looks like, why it exists in this campaign, what makes it specific to this artist. Written in creative director voice.",
      "colorway": "Specific colors from the campaign palette",
      "keyDetail": "The one thing that makes this item special",
      "isHeroItem": false,
      "priceRange": "value | mid | premium | luxury"
    }
  ]
}

DO NOT:
- Suggest items that don't exist in the artist's cultural world
- Describe items in e-commerce language ("comfortable and stylish")
- Default to the same items across different campaigns
- Ignore the brand references
- Suggest luxury materials for value audiences or vice versa
- Forget that merch is WORN IN PUBLIC — it needs to look good as standalone clothing`;

export async function generateProductDirection(
  artistName: string,
  synthesis: any,
  touchpoints: any,
  productRefImages?: { base64: string; mimeType: string }[],
): Promise<ProductSection> {
  const anthropic = getClient();
  console.log(`Generating product direction for ${artistName}...`);

  // Build context from synthesis
  const context: string[] = [];
  
  context.push(`ARTIST: ${artistName}`);
  
  if (synthesis.manifesto) {
    context.push(`\nMANIFESTO: ${synthesis.manifesto}`);
  }
  
  if (synthesis.narrative) {
    context.push(`\nNARRATIVE (excerpt): ${synthesis.narrative.slice(0, 500)}`);
  }
  
  if (synthesis.color_system) {
    const colors = synthesis.color_system.primary_palette?.map((c: any) => c.hex).join(', ') || '';
    const accents = synthesis.color_system.accent_colors?.map((c: any) => c.hex).join(', ') || '';
    context.push(`\nCOLOR PALETTE: Primary: ${colors}. Accents: ${accents}. ${synthesis.color_system.color_story || ''}`);
  }
  
  if (synthesis.aesthetic_profile) {
    const tags = synthesis.aesthetic_profile.tags?.map((t: any) => t.tag).join(', ') || '';
    context.push(`\nAESTHETIC: ${tags}. ${synthesis.aesthetic_profile.description || ''}`);
  }
  
  if (synthesis.mood_profile) {
    context.push(`\nMOOD: ${synthesis.mood_profile.primary_mood}. Energy: ${synthesis.mood_profile.energy}. ${synthesis.mood_profile.mood_arc || ''}`);
  }
  
  if (synthesis.cultural_mapping) {
    const subs = synthesis.cultural_mapping.subcultures?.map((s: any) => s.name).join(', ') || '';
    const eras = synthesis.cultural_mapping.era_references?.map((e: any) => e.era).join(', ') || '';
    context.push(`\nCULTURAL CONTEXT: Subcultures: ${subs}. Eras: ${eras}.`);
  }

  // Extract brand references from the analysis
  if (synthesis.cultural_mapping?.graph_node_matches) {
    const brands = synthesis.cultural_mapping.graph_node_matches
      .filter((m: any) => m.label === 'Brand' || m.label === 'Designer')
      .map((m: any) => m.id.replace(/-/g, ' '))
      .join(', ');
    if (brands) context.push(`\nBRAND REFERENCES: ${brands}`);
  }

  // Pull in touchpoint context for merch
  const merchTouchpoints: string[] = [];
  if (touchpoints?.merchandise_tees) merchTouchpoints.push(`Tees direction: ${touchpoints.merchandise_tees}`);
  if (touchpoints?.merchandise_hoodies) merchTouchpoints.push(`Hoodies direction: ${touchpoints.merchandise_hoodies}`);
  if (touchpoints?.merchandise_hats) merchTouchpoints.push(`Hats direction: ${touchpoints.merchandise_hats}`);
  if (touchpoints?.merchandise_accessories) merchTouchpoints.push(`Accessories direction: ${touchpoints.merchandise_accessories}`);
  if (touchpoints?.typography) merchTouchpoints.push(`Typography: ${touchpoints.typography}`);
  if (touchpoints?.styling_artist) merchTouchpoints.push(`Artist styling: ${touchpoints.styling_artist}`);
  if (touchpoints?.brand_partnerships) merchTouchpoints.push(`Brand alignment: ${touchpoints.brand_partnerships}`);
  if (merchTouchpoints.length > 0) {
    context.push(`\nCREATIVE DIRECTION TOUCHPOINTS:\n${merchTouchpoints.join('\n')}`);
  }

  if (synthesis.visual_language) {
    context.push(`\nVISUAL LANGUAGE: Textures: ${synthesis.visual_language.texture_vocabulary?.join(', ') || 'N/A'}. Medium: ${synthesis.visual_language.medium_preference?.join(', ') || 'N/A'}.`);
  }

  // Thread-pull cultural intelligence (if available)
  if ((synthesis as any).threadPull) {
    const tp = (synthesis as any).threadPull;
    if (tp.productFormats?.length) {
      context.push(`\nTHREAD-PULL PRODUCT FORMATS (objects that naturally exist in this cultural world — use these as primary inspiration for Tier 2 discovery items):\n${tp.productFormats.join('\n')}`);
    }
    if (tp.materials?.length) {
      context.push(`\nTHREAD-PULL MATERIALS (native to this world):\n${tp.materials.join('\n')}`);
    }
    if (tp.brands?.length) {
      context.push(`\nTHREAD-PULL BRAND CONTEXT:\n${tp.brands.join('\n')}`);
    }
    if (tp.ingenuityZones?.length) {
      context.push(`\nINGENUITY ZONES (where cultural threads overlap — the most native product territory):\n${tp.ingenuityZones.join('\n')}`);
    }
    if (tp.userContext?.length) {
      context.push(`\nUSER CONTEXT (things not visible in photos but important):\n${tp.userContext.join('\n')}`);
    }
  }

  // Build message content — text context + optional product reference images
  const messageContent: any[] = [];

  if (productRefImages && productRefImages.length > 0) {
    context.push(`\nPRODUCT REFERENCES: ${productRefImages.length} reference images provided below. These show the types of products, materials, silhouettes, and physical objects the user wants to explore. Use them as direct inspiration — the items you suggest should feel like they belong in the same world as these references.`);
    messageContent.push({ type: 'text', text: context.join('\n') });
    for (const img of productRefImages.slice(0, 10)) {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      });
    }
  } else {
    messageContent.push({ type: 'text', text: context.join('\n') });
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: PRODUCT_PROMPT,
    messages: [{
      role: 'user',
      content: messageContent,
    }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No product response from Claude');
  }

  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);
  
  console.log(`✅ Generated ${parsed.items?.length || 0} product items (hero: ${parsed.items?.find((i: any) => i.isHeroItem)?.name || 'none'})`);

  return {
    overviewNarrative: parsed.overviewNarrative || '',
    items: (parsed.items || []).map((item: any) => ({
      name: item.name,
      category: item.category || 'lifestyle',
      description: item.description,
      colorway: item.colorway,
      keyDetail: item.keyDetail,
      isHeroItem: item.isHeroItem || false,
      priceRange: item.priceRange,
    })),
  };
}
