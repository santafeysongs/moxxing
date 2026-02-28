/**
 * Deck Assembler — Orchestrates slide generation for Culture & Context
 * 
 * Three deck types: Campaign (25-40), Project (40-60), Identity Bible (15-25)
 * Pipeline: SlideData → template functions → HTML → Puppeteer → PNG → pdf-lib → PDF
 */

import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { MoodBoardAnalysis } from '@cultural-graph/analysis-engine/src/types';
import {
  SlideData, DeckType,
  heroSlide, titleSlide, sectionDivider, sectionDividerLight, manifestoSlide,
  textAndCollage, textAndCollageLarge, textAndCollageLight,
  fullImageGrid, colorPaletteSlideDark, colorPaletteSlideLight,
  threeColumnFramework, threeColumnFrameworkDark,
  bulletListSlide, comparisonSlide, closingSlide,
  rolloutStrategy, videoOverview, videoTreatment, videoTreatmentGrid,
  talentRecommendation, tocSlide, productGrid, productDetailSlides, logoGrid,
  stageDesign, aestheticFormula, stylingDuality,
} from './templates';

// ── HELPERS ─────────────────────────────────────────

function getGenImagesBySection(generatedImages: any[] | undefined, section: string): string[] {
  if (!generatedImages) return [];
  return generatedImages
    .filter((i: any) => i.section === section)
    .map((i: any) => `data:image/png;base64,${i.base64}`);
}

function tp(touchpoints: any, key: string): string {
  return touchpoints?.[key] || '';
}

/** Track images used across the deck to avoid repetition */
class ImageTracker {
  private useCounts: Map<string, number> = new Map();

  /** Pick images that haven't been used much, from the given pool */
  pick(images: string[], count: number): string[] {
    if (!images.length) return [];
    // Sort by use count (least used first), then pick
    const sorted = [...images].sort((a, b) => {
      return (this.useCounts.get(a) || 0) - (this.useCounts.get(b) || 0);
    });
    const result: string[] = [];
    for (let i = 0; i < count && i < sorted.length; i++) {
      result.push(sorted[i]);
      this.useCounts.set(sorted[i], (this.useCounts.get(sorted[i]) || 0) + 1);
    }
    return result;
  }
}

// Global tracker instance — reset per deck assembly
let imageTracker = new ImageTracker();

function pickImages(images: string[], count: number, offset = 0): string[] {
  return imageTracker.pick(images, count);
}

// ── BUILD SLIDE DATA ────────────────────────────────

function buildSlideData(analysis: MoodBoardAnalysis, generatedImages?: any[], artistPhotos?: string[]): SlideData {
  const s = analysis.synthesis;
  const imageUrls = (analysis as any)._imageUrls || [];
  const starredUrls = (analysis as any)._starredUrls || [];

  // Map generated images by section
  const genBySection: Record<string, string[]> = {};
  if (generatedImages) {
    for (const img of generatedImages) {
      const section = img.section || 'other';
      if (!genBySection[section]) genBySection[section] = [];
      genBySection[section].push(`data:image/png;base64,${img.base64}`);
    }
  }

  return {
    artistName: (analysis as any).artistName || 'Artist',
    manifesto: s.manifesto || '',
    extendedNarrative: s.narrative || '',
    colorPalette: [
      ...s.color_system.primary_palette,
    ].slice(0, 5).map(c => ({ hex: c.hex, weight: c.weight, name: undefined })),
    colorRationale: s.color_system.color_story || '',
    aestheticTags: s.aesthetic_profile.tags || [],
    moodTags: (s.mood_profile.secondary_moods || []).map(m => ({ tag: m, weight: 0.5 })),
    energy: s.mood_profile.energy || 0.5,
    touchpoints: analysis.touchpoints || {},
    contentPillars: (analysis as any).contentPillars || undefined,
    rolloutActs: (analysis as any).rolloutActs || undefined,
    videoTreatments: (analysis as any).videoTreatments || undefined,
    moodBoardImages: imageUrls,
    starredImages: starredUrls.length ? starredUrls : imageUrls.slice(0, 8),
    generatedImages: genBySection,
    artistPhotos: artistPhotos || [],
    _rawGeneratedImages: generatedImages || [],
    talentRecommendations: buildTalentRecs(analysis),
    stylingDirection: tp(analysis.touchpoints, 'styling_artist'),
    stylingDuality: (analysis as any).stylingDuality || undefined,
    photographyAssessment: (analysis as any).photographyAssessment || undefined,
    productSection: (analysis as any).productSection || undefined,
  };
}

function buildTalentRecs(analysis: MoodBoardAnalysis): SlideData['talentRecommendations'] {
  const recs: NonNullable<SlideData['talentRecommendations']> = [];
  const rt = analysis.recommended_talent;
  if (!rt) return recs;

  for (const p of (rt.photographers || []).slice(0, 2)) {
    recs.push({ name: p.node?.name || 'Unknown', type: 'Photographer', rationale: p.node?.description || '' });
  }
  for (const d of (rt.directors || []).slice(0, 1)) {
    recs.push({ name: d.node?.name || 'Unknown', type: 'Director', rationale: d.node?.description || '' });
  }
  for (const s of (rt.stylists || []).slice(0, 1)) {
    recs.push({ name: s.node?.name || 'Unknown', type: 'Stylist', rationale: s.node?.description || '' });
  }
  return recs;
}

// ── INFER DECK TYPE ─────────────────────────────────

function inferDeckType(analysis: MoodBoardAnalysis): DeckType {
  const hasAlbumName = !!(analysis as any).albumName || !!(analysis as any).projectName;
  const hasVideoTreatments = !!((analysis as any).videoTreatments?.length);
  const hasRollout = !!((analysis as any).rolloutActs?.length);
  const imageCount = analysis.image_count || 0;

  if (hasRollout || hasVideoTreatments || hasAlbumName) return 'campaign';
  // Default to project deck — full touchpoints, 40-75 slides
  return 'project';
}

// ── ASSEMBLY: IDENTITY BIBLE (15-25 slides) ─────────

function assembleIdentityBible(data: SlideData): string[] {
  const slides: string[] = [];
  const imgs = [...data.starredImages, ...data.moodBoardImages];
  const photoImgs = data.generatedImages['photography'] || [];

  // 1. Hero
  const heroImg = photoImgs[0] || imgs[0];
  if (heroImg) {
    slides.push(heroSlide(data, heroImg));
  } else {
    slides.push(titleSlide(data));
  }

  // 2-4. Reference images — the real photos
  if (imgs.length > 0) {
    slides.push(fullImageGrid(data, imgs.slice(0, 6)));
    if (imgs.length > 6) slides.push(fullImageGrid(data, imgs.slice(6, 12)));
    if (imgs.length > 12) slides.push(fullImageGrid(data, imgs.slice(12, 18)));
  }

  // 5. Manifesto
  slides.push(manifestoSlide(data));

  // 5. Aesthetic formula
  slides.push(aestheticFormula(data));

  // 6-8. Content pillars (if available)
  if (data.contentPillars && data.contentPillars.length >= 3) {
    slides.push(threeColumnFramework(data, {
      title: 'CONTENT STRATEGY',
      intro: `three pillars that define how ${data.artistName.toLowerCase()} shows up across every platform.`,
      columns: data.contentPillars.map(p => ({
        title: p.title,
        subtitle: p.subtitle,
        items: p.traits,
      })),
    }));

    // One detail slide per pillar
    for (let i = 0; i < Math.min(3, data.contentPillars.length); i++) {
      const p = data.contentPillars[i];
      const template = i % 2 === 0 ? textAndCollage : textAndCollageLight;
      slides.push(template(data, {
        title: p.title,
        body: `<p>${p.subtitle}</p><br><p>${p.traits.join(' · ')}</p>`,
        images: pickImages(imgs, 4, i * 4),
      }));
    }
  }

  // 9. Color palette
  slides.push(colorPaletteSlideLight(data));

  // 10-11. Photography assessment
  if (data.photographyAssessment) {
    slides.push(comparisonSlide(data, {
      leftTitle: 'WHERE WE ARE',
      leftBody: data.photographyAssessment.current,
      leftImages: data.artistPhotos.slice(0, 2),
      rightTitle: 'WHERE WE CAN GO',
      rightBody: data.photographyAssessment.future,
      rightImages: pickImages([...data.starredImages, ...data.moodBoardImages], 2),
    }));
  } else {
    // Photography direction
    slides.push(textAndCollageLarge(data, {
      title: 'PHOTOGRAPHY',
      body: tp(data.touchpoints, 'photography'),
      images: [...(data.generatedImages['photography'] || []), ...imgs].slice(0, 3),
    }));
  }

  // 12. Styling
  if (data.stylingDuality) {
    slides.push(stylingDuality(data));
  } else if (data.stylingDirection) {
    slides.push(textAndCollage(data, {
      title: 'STYLING',
      body: data.stylingDirection,
      images: pickImages(imgs, 4, 8),
    }));
  }

  // 13. Closing
  slides.push(closingSlide(data));

  return slides;
}

// ── ASSEMBLY: CAMPAIGN DECK (25-40 slides) ──────────

function assembleCampaignDeck(data: SlideData): string[] {
  const slides: string[] = [];
  const refs = [...data.starredImages, ...data.moodBoardImages];
  const photoImgs = data.generatedImages['photography'] || [];
  const videoImgs = data.generatedImages['video'] || [];
  const coverImgs = data.generatedImages['cover-art'] || [];
  const productImgs = data.generatedImages['product'] || [];
  const logoImgs = data.generatedImages['logo'] || [];
  const liveImgs = data.generatedImages['live'] || [];
  const packagingImgs = data.generatedImages['packaging'] || [];

  // ── PAGE 1: HERO — best generated image, full bleed ──
  const heroImg = photoImgs[0] || coverImgs[0] || refs[0];
  if (heroImg) {
    slides.push(heroSlide(data, heroImg));
  } else {
    slides.push(titleSlide(data));
  }

  // ── PAGES 2-4: REFERENCE IMAGES — the real photos, not mockups ──
  // These are the Pinterest/uploaded images that define the visual world.
  // 20-30 images across 3-5 slides.
  if (refs.length > 0) {
    // First reference spread — 6 images
    slides.push(fullImageGrid(data, refs.slice(0, 6)));
    // Second spread
    if (refs.length > 6) slides.push(fullImageGrid(data, refs.slice(6, 12)));
    // Third spread
    if (refs.length > 12) slides.push(fullImageGrid(data, refs.slice(12, 18)));
    // Fourth spread if we have enough
    if (refs.length > 18) slides.push(fullImageGrid(data, refs.slice(18, 24)));
    // Fifth spread
    if (refs.length > 24) slides.push(fullImageGrid(data, refs.slice(24, 30)));
  }

  // ── CREATIVE OVERVIEW ──
  slides.push(manifestoSlide(data));
  slides.push(colorPaletteSlideDark(data));

  // ── PHOTOGRAPHY ──
  if (photoImgs.length > 0 || tp(data.touchpoints, 'photography')) {
    slides.push(sectionDivider(data, 'PHOTOGRAPHY'));
    if (tp(data.touchpoints, 'photography')) {
      slides.push(textAndCollageLarge(data, {
        title: 'PHOTOGRAPHY DIRECTION',
        body: tp(data.touchpoints, 'photography'),
        images: photoImgs.slice(0, 3),
      }));
    }
    if (photoImgs.length > 0) {
      slides.push(fullImageGrid(data, photoImgs.slice(0, 6)));
    }
  }

  const photoRec = data.talentRecommendations?.find(t => t.type === 'Photographer');
  if (photoRec) slides.push(talentRecommendation(data, photoRec));

  // ── COVER ART ──
  if (coverImgs.length > 0) {
    slides.push(sectionDivider(data, 'ALBUM & SINGLE ART'));
    slides.push(fullImageGrid(data, coverImgs.slice(0, 4)));
  }

  // ── LOGO ──
  if (logoImgs.length > 0) {
    slides.push(logoGrid(data));
  }

  // ── PACKAGING ──
  if (packagingImgs.length > 0) {
    slides.push(sectionDivider(data, 'PACKAGING'));
    slides.push(fullImageGrid(data, packagingImgs));
  }

  // ── VIDEOS ──
  if (videoImgs.length > 0 || data.videoTreatments?.length || tp(data.touchpoints, 'music_video')) {
    slides.push(sectionDivider(data, 'VIDEOS'));
    if (tp(data.touchpoints, 'music_video') && !data.videoTreatments?.length) {
      slides.push(textAndCollage(data, {
        title: 'VIDEO DIRECTION',
        body: tp(data.touchpoints, 'music_video'),
        images: [...videoImgs, ...refs].slice(0, 4),
      }));
    }
    if (data.videoTreatments?.length) {
      for (const vt of data.videoTreatments.slice(0, 3)) {
        const vtRefs = vt.references?.length ? vt.references : [...videoImgs, ...refs].slice(0, 3);
        slides.push(videoTreatment(data, vt, vtRefs));
      }
    } else if (videoImgs.length > 0) {
      slides.push(fullImageGrid(data, videoImgs.slice(0, 6)));
    }
  }

  // ── LIVE ──
  if (liveImgs.length > 0 || tp(data.touchpoints, 'stage_design')) {
    slides.push(sectionDivider(data, 'LIVE'));
    if (tp(data.touchpoints, 'stage_design')) {
      slides.push(textAndCollage(data, {
        title: 'LIVE SHOW',
        body: tp(data.touchpoints, 'stage_design'),
        images: liveImgs.slice(0, 3),
      }));
    }
    if (liveImgs.length > 0) slides.push(fullImageGrid(data, liveImgs));
  }

  // ── STYLING ──
  if (data.stylingDuality || tp(data.touchpoints, 'styling_artist')) {
    slides.push(sectionDivider(data, 'STYLING'));
    if (data.stylingDuality) {
      slides.push(stylingDuality(data));
    } else {
      slides.push(textAndCollage(data, {
        title: 'STYLING',
        body: tp(data.touchpoints, 'styling_artist'),
        images: pickImages(refs, 4, 12),
      }));
    }
  }

  // ── PRODUCT DESIGN ──
  if (productImgs.length > 0 || data.productSection?.items?.length) {
    slides.push(sectionDivider(data, 'PRODUCT DESIGN'));
    if (productImgs.length) slides.push(productGrid(data));
    slides.push(...productDetailSlides(data));
  }

  // ── ROLLOUT ──
  if (data.rolloutActs?.length) {
    slides.push(sectionDivider(data, 'ROLLOUT'));
    slides.push(rolloutStrategy(data));
  }

  // ── CLOSING ──
  slides.push(closingSlide(data));

  return slides;
}

// ── ASSEMBLY: PROJECT DECK (40-60 slides) ───────────

function assembleProjectDeck(data: SlideData): string[] {
  const slides: string[] = [];
  const refs = [...data.starredImages, ...data.moodBoardImages];
  const photoImgs = data.generatedImages['photography'] || [];
  const videoImgs = data.generatedImages['video'] || [];
  const coverImgs = data.generatedImages['cover-art'] || [];
  const packagingImgs = data.generatedImages['packaging'] || [];
  const productImgs = data.generatedImages['product'] || [];
  const logoImgs = data.generatedImages['logo'] || [];
  const liveImgs = data.generatedImages['live'] || [];

  // ── PAGE 1: HERO — best generated image, full bleed ──
  const heroImg = photoImgs[0] || coverImgs[0] || refs[0];
  if (heroImg) {
    slides.push(heroSlide(data, heroImg));
  } else {
    slides.push(titleSlide(data));
  }

  // ── PAGES 2-5: REFERENCE IMAGES — the real photos, 20-30 images ──
  if (refs.length > 0) {
    slides.push(fullImageGrid(data, refs.slice(0, 6)));
    if (refs.length > 6) slides.push(fullImageGrid(data, refs.slice(6, 12)));
    if (refs.length > 12) slides.push(fullImageGrid(data, refs.slice(12, 18)));
    if (refs.length > 18) slides.push(fullImageGrid(data, refs.slice(18, 24)));
    if (refs.length > 24) slides.push(fullImageGrid(data, refs.slice(24, 30)));
  }

  // ── CREATIVE OVERVIEW ──
  slides.push(manifestoSlide(data));
  slides.push(colorPaletteSlideLight(data));

  // ── PHOTOGRAPHY ──
  if (photoImgs.length > 0 || tp(data.touchpoints, 'photography')) {
    slides.push(sectionDividerLight(data, 'PHOTOGRAPHY'));
    if (tp(data.touchpoints, 'photography')) {
      slides.push(textAndCollageLarge(data, {
        title: 'PHOTOGRAPHY DIRECTION',
        body: tp(data.touchpoints, 'photography'),
        images: photoImgs.slice(0, 3),
      }));
    }
    if (photoImgs.length > 0) slides.push(fullImageGrid(data, photoImgs.slice(0, 6)));
    if (photoImgs.length > 6) slides.push(fullImageGrid(data, photoImgs.slice(6, 12)));
  }

  const photoRec = data.talentRecommendations?.find(t => t.type === 'Photographer');
  if (photoRec) slides.push(talentRecommendation(data, photoRec));

  // ── LOGO ──
  if (logoImgs.length > 0) {
    slides.push(logoGrid(data));
  }

  // ── COVER ART ──
  if (coverImgs.length > 0) {
    slides.push(sectionDivider(data, 'COVER ART'));
    slides.push(fullImageGrid(data, coverImgs));
  }

  // ── PACKAGING ──
  if (packagingImgs.length > 0) {
    slides.push(sectionDivider(data, 'PACKAGING'));
    slides.push(fullImageGrid(data, packagingImgs));
  }

  // ── VIDEOS ──
  if (videoImgs.length > 0 || data.videoTreatments?.length || tp(data.touchpoints, 'music_video')) {
    slides.push(sectionDivider(data, 'VIDEOS'));
    if (tp(data.touchpoints, 'music_video') && !data.videoTreatments?.length) {
      slides.push(textAndCollage(data, {
        title: 'VIDEO DIRECTION',
        body: tp(data.touchpoints, 'music_video'),
        images: [...videoImgs, ...refs].slice(0, 4),
      }));
    }
    if (data.videoTreatments?.length) {
      for (const vt of data.videoTreatments.slice(0, 3)) {
        const vtRefs = vt.references?.length ? vt.references : [...videoImgs, ...refs].slice(0, 3);
        slides.push(videoTreatment(data, vt, vtRefs));
      }
    } else if (videoImgs.length > 0) {
      slides.push(fullImageGrid(data, videoImgs));
    }
  }

  // ── LIVE ──
  if (liveImgs.length > 0 || tp(data.touchpoints, 'stage_design')) {
    slides.push(sectionDivider(data, 'LIVE'));
    if (tp(data.touchpoints, 'stage_design')) {
      slides.push(textAndCollage(data, {
        title: 'LIVE SHOW',
        body: tp(data.touchpoints, 'stage_design'),
        images: liveImgs.slice(0, 3),
      }));
    }
    if (liveImgs.length > 0) slides.push(fullImageGrid(data, liveImgs));
  }

  // ── STYLING ──
  if (data.stylingDuality || tp(data.touchpoints, 'styling_artist')) {
    slides.push(sectionDivider(data, 'STYLING'));
    if (data.stylingDuality) {
      slides.push(stylingDuality(data));
    } else {
      slides.push(textAndCollage(data, {
        title: 'STYLING',
        body: tp(data.touchpoints, 'styling_artist'),
        images: pickImages(refs, 4, 12),
      }));
    }
  }

  // ── PRODUCT DESIGN ──
  if (productImgs.length > 0 || data.productSection?.items?.length) {
    slides.push(sectionDivider(data, 'PRODUCT DESIGN'));
    if (productImgs.length) slides.push(productGrid(data));
    slides.push(...productDetailSlides(data));
  }

  // Closing
  slides.push(closingSlide(data));

  return slides;
}

// ── MAIN ASSEMBLY FUNCTION ──────────────────────────

export function assembleSmartDeck(
  analysis: MoodBoardAnalysis,
  deckType?: DeckType,
  generatedImages?: any[],
  artistPhotos?: string[],
): string[] {
  // Single tracker for the ENTIRE deck — prevents image repetition across sections
  imageTracker = new ImageTracker();
  const data = buildSlideData(analysis, generatedImages, artistPhotos);
  const type = deckType || inferDeckType(analysis);

  console.log(`Assembling ${type} deck for "${data.artistName}"...`);

  let slides: string[];
  switch (type) {
    case 'campaign':
      slides = assembleCampaignDeck(data);
      break;
    case 'project':
      slides = assembleProjectDeck(data);
      break;
    case 'identity':
    default:
      slides = assembleIdentityBible(data);
      break;
  }

  console.log(`  → ${slides.length} slides generated`);
  return slides;
}

// ── RENDER TO PDF ───────────────────────────────────

export async function renderDeckPDF(
  slideHtmls: string[],
  outputPath?: string
): Promise<Buffer> {
  console.log(`Rendering ${slideHtmls.length} slides to PDF...`);

  const browser = await puppeteer.launch({
    headless: 'new' as any,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pdfDoc = await PDFDocument.create();

  try {
    for (let i = 0; i < slideHtmls.length; i++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setContent(slideHtmls[i], { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Brief pause for images to render
      await new Promise(r => setTimeout(r, 500));

      // Small delay for font loading
      await new Promise(r => setTimeout(r, 300));

      const pngBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      });

      // Embed PNG into PDF page
      const pngImage = await pdfDoc.embedPng(pngBuffer);
      const pdfPage = pdfDoc.addPage([1920, 1080]);
      pdfPage.drawImage(pngImage, {
        x: 0, y: 0, width: 1920, height: 1080,
      });

      await page.close();

      if ((i + 1) % 10 === 0 || i === slideHtmls.length - 1) {
        console.log(`  rendered ${i + 1}/${slideHtmls.length}`);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    if (outputPath) {
      const fs = await import('fs');
      fs.writeFileSync(outputPath, buffer);
      console.log(`  ✓ PDF saved: ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    }

    return buffer;
  } finally {
    await browser.close();
  }
}

// ── LEGACY COMPATIBILITY ────────────────────────────
// Keep the old function signatures working for the API

export async function generateDeck(
  analysis: MoodBoardAnalysis,
  generatedImages?: any[],
): Promise<{ file: Buffer }> {
  const slides = assembleSmartDeck(analysis, undefined, generatedImages);
  const buffer = await renderDeckPDF(slides);
  return { file: buffer, slideCount: slides.length };
}

export async function assembleDeck(
  analysis: MoodBoardAnalysis,
  options?: { format?: string; generatedImages?: any[]; artistPhotos?: string[]; deckType?: DeckType },
): Promise<Buffer> {
  const slides = assembleSmartDeck(
    analysis,
    options?.deckType,
    options?.generatedImages,
    options?.artistPhotos,
  );
  return renderDeckPDF(slides);
}

/** Return raw slide HTML strings for PPTX export (render to PNG yourself) */
export function assembleDeckHtmls(
  analysis: MoodBoardAnalysis,
  options?: { generatedImages?: any[]; artistPhotos?: string[]; deckType?: DeckType },
): string[] {
  return assembleSmartDeck(
    analysis,
    options?.deckType,
    options?.generatedImages,
    options?.artistPhotos,
  );
}
