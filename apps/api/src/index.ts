import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ── Stripe setup ──
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const TIME_PASS_TIERS: Record<string, { label: string; price: number; minutes: number }> = {
  '1h': { label: '1 Hour Pass', price: 500, minutes: 60 },
  '4h': { label: '4 Hour Pass', price: 1500, minutes: 240 },
  '8h': { label: '8 Hour Pass', price: 5000, minutes: 480 },
};

// In-memory session cache: sessionId → { paid, tier, expiresAt, cachedAt }
const sessionCache = new Map<string, { paid: boolean; tier: string; expiresAt: Date; cachedAt: number }>();
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function validateStripeSession(sessionId: string): Promise<{ valid: boolean; tier: string; expiresAt: Date; remainingMinutes: number }> {
  // Check cache first
  const cached = sessionCache.get(sessionId);
  if (cached && Date.now() - cached.cachedAt < SESSION_CACHE_TTL) {
    const remaining = Math.max(0, Math.floor((cached.expiresAt.getTime() - Date.now()) / 60000));
    return { valid: cached.paid && remaining > 0, tier: cached.tier, expiresAt: cached.expiresAt, remainingMinutes: remaining };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return { valid: false, tier: '', expiresAt: new Date(), remainingMinutes: 0 };
    }

    const tier = (session.metadata?.tier || '1h') as string;
    const tierConfig = TIME_PASS_TIERS[tier] || TIME_PASS_TIERS['1h'];
    // Use payment completion time (session created + small buffer) or fall back to created timestamp
    const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000);
    const expiresAt = new Date(paidAt.getTime() + tierConfig.minutes * 60 * 1000);
    const remainingMinutes = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000));

    // Cache the result
    sessionCache.set(sessionId, { paid: true, tier, expiresAt, cachedAt: Date.now() });

    return { valid: remainingMinutes > 0, tier, expiresAt, remainingMinutes };
  } catch (e: any) {
    console.error('Stripe session validation failed:', e.message);
    return { valid: false, tier: '', expiresAt: new Date(), remainingMinutes: 0 };
  }
}

import { analyzeMoodBoard } from '@cultural-graph/analysis-engine/src/batch-analyzer';
import { scrapePinterestBoard, cleanupPinterestFiles } from '@cultural-graph/analysis-engine/src/pinterest-scraper';
import { analyzeYouTubeVideo } from '@cultural-graph/analysis-engine/src/youtube-analyzer';
import { ingestEntity, ingestMultiple } from '@cultural-graph/analysis-engine/src/entity-ingestion';
import { generateCreativeImages, ArtistPhoto, MoodBoardImage } from '@cultural-graph/analysis-engine/src/image-generator';
import { generateProductDirection } from '@cultural-graph/analysis-engine/src/product-designer';
// World bible removed — thread-pull replaces it
// Recraft removed — logos now generated via nano-banana
import { generateTypography } from '@cultural-graph/analysis-engine/src/ideogram-service';
// Reference scorer removed — world bible no longer drives curation
import { findReferences, extractContextFromAnalysis } from '@cultural-graph/analysis-engine/src/reference-engine';
import { recognizeAll, BulkRecognitionResult, CulturalNode } from '@cultural-graph/analysis-engine/src/recognition-engine';
import { crossReference, CrossReferenceResult } from '@cultural-graph/analysis-engine/src/cross-reference';
import { pullAllThreads, ThreadPullResult, SelectedNode } from '@cultural-graph/analysis-engine/src/thread-pull';
import { generateDeck } from '@cultural-graph/deck-generator/src/assembler';
import { MoodBoardAnalysis } from '@cultural-graph/analysis-engine/src/types';
import { getDriver, verifyConnection } from '@cultural-graph/graph-db/src/connection';

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// ── Persistent campaign store ──
const CAMPAIGNS_DIR = path.resolve(__dirname, '../../../data/campaigns');
fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });

interface Campaign {
  id: string;
  status: 'processing' | 'complete' | 'error';
  progress: number;
  result?: MoodBoardAnalysis;
  generatedImages?: any[];
  deck?: Buffer;
  error?: string;
  created_at: string;
  uploadedImages?: Array<{ base64: string; mimeType: string }>;
  pinterestImages?: Array<{ base64: string }>;
  recognitionResult?: any;
  [key: string]: any;
}

const campaigns = new Map<string, Campaign>();

// Save campaign to disk (without deck buffer — that's saved separately as .pdf)
function saveCampaign(campaign: Campaign) {
  const dir = path.join(CAMPAIGNS_DIR, campaign.id);
  fs.mkdirSync(dir, { recursive: true });

  // Save metadata (without deck buffer)
  const { deck, ...meta } = campaign;
  fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify(meta, null, 2));

  // Save deck as separate PDF file
  if (deck) {
    fs.writeFileSync(path.join(dir, 'deck.pdf'), deck);
  }
}

// Load campaign from disk
function loadCampaign(id: string): Campaign | null {
  const dir = path.join(CAMPAIGNS_DIR, id);
  const metaPath = path.join(dir, 'campaign.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const deckPath = path.join(dir, 'deck.pdf');
    if (fs.existsSync(deckPath)) {
      meta.deck = fs.readFileSync(deckPath);
    }
    return meta as Campaign;
  } catch {
    return null;
  }
}

// Load all campaigns on startup
function loadAllCampaigns() {
  if (!fs.existsSync(CAMPAIGNS_DIR)) return;
  const dirs = fs.readdirSync(CAMPAIGNS_DIR);
  for (const id of dirs) {
    const campaign = loadCampaign(id);
    if (campaign) {
      campaigns.set(id, campaign);
    }
  }
  console.log(`Loaded ${campaigns.size} campaigns from disk`);
}

loadAllCampaigns();

// ── HEALTH ──
app.get('/health', async (_req, res) => {
  const neo4jOk = await verifyConnection().catch(() => false);
  res.json({ status: 'ok', neo4j: neo4jOk ? 'connected' : 'disconnected', version: '0.1.0' });
});

// ── CAMPAIGNS ──
const campaignUpload = upload.fields([
  { name: 'images', maxCount: 200 },
  { name: 'artist_photos', maxCount: 10 },
  { name: 'product_refs', maxCount: 20 },
  { name: 'reference_decks', maxCount: 5 },
]);

app.post('/api/campaigns', campaignUpload, async (req, res) => {
  try {
    const campaignId = uuid();
    const campaign: Campaign = {
      id: campaignId,
      status: 'processing',
      progress: 0,
      created_at: new Date().toISOString(),
    };
    campaigns.set(campaignId, campaign);

    res.status(201).json({ campaign_id: campaignId, status: 'processing' });

    // Process async
    (async () => {
      try {
        const images: (Buffer | string)[] = [];
        const moodBoardRefs: MoodBoardImage[] = []; // for image generation
        const artistPhotos: ArtistPhoto[] = [];
        const imageUrls: string[] = [];

        // Handle uploaded files (from multer fields)
        const fileFields = req.files as { [fieldname: string]: Express.Multer.File[] } || {};
        for (const file of fileFields['images'] || []) {
          images.push(file.buffer);
          // Also keep base64 for image generation (only first 20 to limit memory)
          if (moodBoardRefs.length < 20) {
            moodBoardRefs.push({
              base64: file.buffer.toString('base64'),
              mimeType: file.mimetype,
            });
          }
        }
        for (const file of fileFields['artist_photos'] || []) {
          const norm = await normalizeImage(file.buffer, file.mimetype);
          artistPhotos.push({
            base64: norm.buffer.toString('base64'),
            mimeType: norm.mimeType,
          });
        }
        // Product reference images
        const productRefImages: { base64: string; mimeType: string }[] = [];
        for (const file of fileFields['product_refs'] || []) {
          const norm = await normalizeImage(file.buffer, file.mimetype);
          productRefImages.push({
            base64: norm.buffer.toString('base64'),
            mimeType: norm.mimeType,
          });
        }
        console.log(`${productRefImages.length} product reference images`);

        // Extract pages from reference decks as images
        const refDecks = fileFields['reference_decks'] || [];
        if (refDecks.length > 0) {
          console.log(`Processing ${refDecks.length} reference deck(s)...`);
          try {
            const puppeteer = require('puppeteer');
            const { PDFDocument } = require('pdf-lib');
            const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

            for (const deckFile of refDecks) {
              try {
                const pdfDoc = await PDFDocument.load(deckFile.buffer);
                const pageCount = Math.min(pdfDoc.getPageCount(), 30); // Cap at 30 pages per deck
                console.log(`  Deck "${deckFile.originalname}": ${pageCount} pages`);

                for (let i = 0; i < pageCount; i++) {
                  const singlePdf = await PDFDocument.create();
                  const [page] = await singlePdf.copyPages(pdfDoc, [i]);
                  singlePdf.addPage(page);
                  const bytes = await singlePdf.save();

                  const browserPage = await browser.newPage();
                  await browserPage.setViewport({ width: 1920, height: 1080 });
                  const dataUri = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
                  await browserPage.goto(dataUri, { waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
                  const screenshot = await browserPage.screenshot({ type: 'jpeg', quality: 80 });
                  await browserPage.close();

                  images.push(screenshot as Buffer);
                  if (moodBoardRefs.length < 20) {
                    moodBoardRefs.push({ base64: (screenshot as Buffer).toString('base64'), mimeType: 'image/jpeg' });
                  }
                }
              } catch (e: any) {
                console.warn(`  Failed to process deck: ${e.message}`);
              }
            }
            await browser.close();
          } catch (e: any) {
            console.warn('Reference deck processing failed:', e.message);
          }
        }

        console.log(`Total: ${images.length} images (incl. deck pages), ${artistPhotos.length} artist photos`);
        campaign.progress = 10;

        // Pinterest scrape
        const pinterestUrl = req.body?.pinterest_url;
        const pinterestDataUris: string[] = [];
        if (pinterestUrl) {
          try {
            const board = await scrapePinterestBoard(pinterestUrl);
            for (const img of board.images) {
              images.push(img.buffer);
              const b64 = img.buffer.toString('base64');
              if (moodBoardRefs.length < 20) {
                moodBoardRefs.push({ base64: b64, mimeType: 'image/jpeg' });
              }
              pinterestDataUris.push(`data:image/jpeg;base64,${b64}`);
            }
            console.log(`Pinterest: scraped ${board.images.length} images`);
            cleanupPinterestFiles(board);
          } catch (e: any) {
            console.warn('Pinterest scrape failed:', e.message);
          }
        }
        campaign.progress = 20;

        // Parse other inputs
        const artistNames = req.body?.artist_names ? JSON.parse(req.body.artist_names) : [];
        const textBrief = req.body?.text_brief || '';
        const youtubeUrls = req.body?.youtube_urls ? JSON.parse(req.body.youtube_urls) : [];
        const starredIndices: number[] = req.body?.starred_indices ? JSON.parse(req.body.starred_indices) : [];
        const fontDirections: string[] = req.body?.font_directions ? JSON.parse(req.body.font_directions) : [];

        // Analyze YouTube thumbnails as additional images
        for (const ytUrl of youtubeUrls) {
          try {
            const ytAnalysis = await analyzeYouTubeVideo(ytUrl);
            if (ytAnalysis.thumbnail_url) {
              images.push(ytAnalysis.thumbnail_url);
            }
          } catch (e: any) {
            console.warn('YouTube analysis failed:', e.message);
          }
        }
        campaign.progress = 30;

        if (images.length === 0) {
          throw new Error('No images provided');
        }

        // Build enriched brief with font directions
        let enrichedBrief = textBrief;
        if (fontDirections.length > 0) {
          const fontMap: Record<string, string> = {
            'grotesque': 'Grotesque sans-serif (Helvetica, Akzidenz — clean, universal, modernist)',
            'neo-grotesk': 'Neo-Grotesk (Neue Haas, Suisse, Untitled — contemporary, tech-forward)',
            'geometric': 'Geometric sans-serif (Futura, Avant Garde — Bauhaus, structural, bold)',
            'humanist': 'Humanist sans-serif (Gill Sans, Frutiger — warm, approachable, organic)',
            'transitional-serif': 'Transitional serif (Times, Baskerville — editorial, literary, classic)',
            'didone': 'Didone/high-contrast serif (Bodoni, Didot — fashion, luxury, dramatic)',
            'slab': 'Slab serif (Rockwell, Clarendon — industrial, bold, vintage)',
            'old-style': 'Old Style serif (Garamond, Caslon — timeless, literary, warm)',
            'mono': 'Monospace (Courier, JetBrains Mono — technical, raw, utilitarian)',
            'handwritten': 'Handwritten/script (brush, marker, calligraphy — personal, DIY, emotional)',
            'display': 'Display/decorative (custom, experimental, bespoke — statement, loud)',
            'blackletter': 'Blackletter/gothic (Fraktur, Old English — metal, streetwear, heritage)',
            'rounded': 'Rounded sans-serif (Nunito, Comfortaa — friendly, playful, soft)',
            'condensed': 'Condensed/compressed (Impact, Knockout — editorial, urgent, high-impact)',
            'brutalist': 'Brutalist/industrial (Druk, GT America — raw, confrontational, heavy)',
            'retro': 'Retro/vintage (Cooper Black, Windsor — 70s, nostalgic, groovy)',
          };
          const fontDescs = fontDirections.map(id => fontMap[id] || id).join('; ');
          enrichedBrief += `\n\nTYPOGRAPHY DIRECTION: The typography for this project should draw from: ${fontDescs}. Use these type families as the foundation for all typography decisions — logo, headlines, body, merch, packaging.`;
        }

        // Run mood board analysis
        const result = await analyzeMoodBoard(images, {
          concurrency: 10,
          artistNames,
          textBrief: enrichedBrief,
          youtubeUrls,
        });

        // Store starred images as base64 data URIs for the deck
        // These are the user-curated hero references
        const uploadedFiles = fileFields['images'] || [];
        const starredDataUris: string[] = [];
        for (const idx of starredIndices) {
          if (idx < uploadedFiles.length) {
            const file = uploadedFiles[idx];
            starredDataUris.push(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`);
          }
        }
        // Combine starred images + Pinterest images for the deck mood board
        const allDeckImages = [...starredDataUris, ...pinterestDataUris];
        (result as any)._imageUrls = allDeckImages.length > 0 ? allDeckImages : imageUrls;
        (result as any)._starredUrls = starredDataUris;

        campaign.progress = 55;

        // ── THREAD-PULL: Cultural intelligence engine ──
        // If the frontend sent cultural_nodes (from recognition step), run thread-pull
        let threadPullResult: ThreadPullResult | null = null;
        const culturalNodesRaw = req.body?.cultural_nodes;
        const missingContext = req.body?.missing_context || '';

        if (culturalNodesRaw) {
          try {
            const selectedNodes: SelectedNode[] = JSON.parse(culturalNodesRaw);
            console.log(`Thread-pull: ${selectedNodes.length} cultural nodes selected`);

            threadPullResult = await pullAllThreads(selectedNodes, missingContext, {
              concurrency: 4,
              onProgress: (done, total) => {
                campaign.progress = 55 + Math.round((done / total) * 10);
              },
            });

            // Store on campaign for later use
            (campaign as any).threadPullResult = threadPullResult;
            (campaign as any).selectedNodes = selectedNodes;

            console.log(`Thread-pull complete: ${threadPullResult.ingenuityZones.length} ingenuity zones`);
            if (threadPullResult.ingenuityZones.length > 0) {
              console.log(`  Top overlaps: ${threadPullResult.ingenuityZones.slice(0, 5).map(o => `${o.signal} (×${o.strength})`).join(', ')}`);
            }
          } catch (e: any) {
            console.warn('Thread-pull failed (non-fatal):', e.message);
          }
        }

        campaign.progress = 65;

        const primaryArtist = artistNames[0] || textBrief?.split(' ')[0] || 'the artist';

        // ── ENRICH SYNTHESIS with thread-pull intelligence ──
        if (threadPullResult && result.synthesis) {
          try {
            const Anthropic = require('@anthropic-ai/sdk');
            const anthropic = new Anthropic.default();
            
            const ingenuitySignals = threadPullResult.ingenuityZones.slice(0, 10).map(z => 
              `${z.signal} (found in ${z.strength} threads: ${z.threadNames.join(', ')})`
            ).join('\n');
            
            const threadSummary = {
              people: threadPullResult.synthesis.people.slice(0, 15),
              brands: threadPullResult.synthesis.brands.slice(0, 10),
              materials: threadPullResult.synthesis.materials.slice(0, 10),
              locations: threadPullResult.synthesis.locations.slice(0, 8),
              equipment: threadPullResult.synthesis.equipment.slice(0, 8),
              visualLanguage: threadPullResult.synthesis.visualLanguage.slice(0, 8),
            };

            const enrichResponse = await anthropic.messages.create({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 2048,
              messages: [{
                role: 'user',
                content: `You are rewriting a creative direction manifesto using cultural intelligence from a thread-pull analysis.

ORIGINAL MANIFESTO:
${result.synthesis.manifesto || ''}

ORIGINAL NARRATIVE:
${result.synthesis.narrative?.slice(0, 500) || ''}

THREAD-PULL INTELLIGENCE — These are the real cultural signals found across the reference images. Use them to make the manifesto SPECIFIC instead of generic:

INGENUITY ZONES (where multiple cultural threads overlap — this is the creative foundation):
${ingenuitySignals || 'None identified'}

CULTURAL NETWORK:
${JSON.stringify(threadSummary, null, 2)}

USER CONTEXT (things not in the photos):
${threadPullResult.userContext.join(', ') || 'None'}

Rewrite the manifesto and narrative to be grounded in these SPECIFIC cultural references. Drop generic phrases like "bold aesthetic" or "authentic expression." Replace them with the actual cultural lineage: specific people, specific eras, specific materials, specific places.

Return JSON:
{
  "manifesto": "2-3 sentences. Specific, not generic. Names names.",
  "narrative": "4-6 sentences. The extended creative thesis grounded in the thread-pull findings.",
  "touchpoints": {
    "photography": "1-2 sentences. Who should shoot this, what it should look like, what equipment/technique.",
    "music_video": "1-2 sentences. Director references, visual language, specific film/video references.",
    "styling": "1-2 sentences. Specific brands, garments, materials native to this world.",
    "products": "1-2 sentences. What objects naturally exist in this world beyond standard merch.",
    "live": "1-2 sentences. What the stage/show looks and feels like."
  }
}`,
              }],
            });

            const enrichText = enrichResponse.content.find((c: any) => c.type === 'text');
            if (enrichText && enrichText.type === 'text') {
              let jsonStr = enrichText.text.trim();
              const fenced = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
              if (fenced) jsonStr = fenced[1].trim();
              if (!jsonStr.startsWith('{')) {
                const idx = jsonStr.indexOf('{');
                if (idx >= 0) jsonStr = jsonStr.substring(idx);
              }
              const lastBrace = jsonStr.lastIndexOf('}');
              if (lastBrace >= 0) jsonStr = jsonStr.substring(0, lastBrace + 1);

              const enriched = JSON.parse(jsonStr);
              
              // Override synthesis with enriched versions
              result.synthesis.manifesto = enriched.manifesto || result.synthesis.manifesto;
              result.synthesis.narrative = enriched.narrative || result.synthesis.narrative;
              
              // Override touchpoints with thread-pull-informed versions
              if (enriched.touchpoints) {
                result.touchpoints = result.touchpoints || {};
                if (enriched.touchpoints.photography) result.touchpoints.photography = enriched.touchpoints.photography;
                if (enriched.touchpoints.music_video) result.touchpoints.music_video = enriched.touchpoints.music_video;
                if (enriched.touchpoints.styling) result.touchpoints.styling_artist = enriched.touchpoints.styling;
                if (enriched.touchpoints.products) result.touchpoints.merchandise_direction = enriched.touchpoints.products;
                if (enriched.touchpoints.live) result.touchpoints.stage_design = enriched.touchpoints.live;
              }

              console.log('Synthesis enriched with thread-pull intelligence');
            }
          } catch (e: any) {
            console.warn('Synthesis enrichment failed (non-fatal):', e.message);
          }
        }

        campaign.progress = 70;

        // Build featured images from starred selections
        const featuredImages: MoodBoardImage[] = [];
        for (const idx of starredIndices) {
          if (idx < uploadedFiles.length) {
            const file = uploadedFiles[idx];
            featuredImages.push({
              base64: file.buffer.toString('base64'),
              mimeType: file.mimetype,
            });
          }
        }

        // Generate AI images with featured-image-driven pipeline
        let generatedImages: any[] = [];
        if (result.synthesis) {
          try {
            console.log('Generating creative direction images...');
            const imgResult = await generateCreativeImages(
              primaryArtist,
              result.synthesis,
              artistPhotos.length > 0 ? artistPhotos : undefined,
              moodBoardRefs.length > 0 ? moodBoardRefs : undefined,
              undefined,
              {
                featuredImages: featuredImages.length > 0 ? featuredImages : undefined,
                productRefImages: productRefImages.length > 0 ? productRefImages : undefined,
                visualLanguage: threadPullResult?.synthesis?.visualLanguage?.slice(0, 5),
              },
            );
            generatedImages = imgResult.images;
            campaign.generatedImages = generatedImages;
            console.log(`Generated ${generatedImages.length} images`);
          } catch (e: any) {
            console.warn('Image generation failed (non-fatal):', e.message);
          }
        }
        campaign.progress = 80;

        // Generate product direction — now informed by thread-pull
        let productSection: any = null;
        if (result.synthesis) {
          try {
            console.log('Generating product direction...');
            // Enrich synthesis with thread-pull data if available
            const enrichedSynthesis = { ...result.synthesis };
            if (threadPullResult) {
              // Inject thread-pull product formats and materials into synthesis context
              (enrichedSynthesis as any).threadPull = {
                productFormats: threadPullResult.synthesis.productFormats,
                materials: threadPullResult.synthesis.materials,
                brands: threadPullResult.synthesis.brands,
                ingenuityZones: threadPullResult.ingenuityZones.slice(0, 10).map(z => z.signal),
                userContext: threadPullResult.userContext,
              };
            }
            productSection = await generateProductDirection(
              primaryArtist,
              enrichedSynthesis,
              result.touchpoints || {},
              productRefImages.length > 0 ? productRefImages : undefined,
            );
            (campaign as any).productSection = productSection;
            console.log(`Generated ${productSection.items?.length || 0} product items`);
          } catch (e: any) {
            console.warn('Product design failed (non-fatal):', e.message);
          }
        }

        campaign.progress = 85;

        // Generate logos via nano-banana
        const typDir = fontDirections.length > 0 ? fontDirections.join(', ') : undefined;
        try {
          console.log('Generating logos via nano-banana...');
          const { GoogleGenAI } = require('@google/genai');
          const logoAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const logoStyles = [
            { style: 'primary-wordmark', prompt: `Clean, minimal wordmark logo for "${primaryArtist}". Just the name in a distinctive typeface${typDir ? ` inspired by ${typDir}` : ''}. Black text on pure white background. No icons, no symbols, no decorative elements. Typography only.` },
            { style: 'monogram', prompt: `Monogram logo using the initials of "${primaryArtist}". Simple, bold letterform. Black on white. No decoration.` },
            { style: 'condensed-wordmark', prompt: `Condensed/stacked wordmark for "${primaryArtist}". Narrow, vertical arrangement. Black on white. Clean type only.` },
          ];
          for (const ls of logoStyles) {
            try {
              const logoRes = await logoAi.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: [{ role: 'user', parts: [{ text: ls.prompt }] }],
                config: { responseModalities: ['TEXT', 'IMAGE'] },
              });
              for (const part of logoRes.candidates?.[0]?.content?.parts || []) {
                if ((part as any).inlineData) {
                  generatedImages.push({
                    id: require('crypto').randomUUID(),
                    base64: (part as any).inlineData.data,
                    prompt: ls.prompt,
                    category: ls.style,
                    section: 'logo',
                  });
                  break;
                }
              }
            } catch (le: any) {
              console.warn(`  Logo ${ls.style} failed:`, le.message?.slice(0, 100));
            }
            await new Promise(r => setTimeout(r, 500));
          }
          const logoCount = generatedImages.filter((g: any) => g.section === 'logo').length;
          console.log(`Generated ${logoCount} logos`);
        } catch (e: any) {
          console.warn('Logo generation failed (non-fatal):', e.message);
        }

        campaign.generatedImages = generatedImages;
        campaign.progress = 90;

        // Attach artist name to result so deck assembler can use it
        (result as any).artistName = primaryArtist;
        (result as any).artist_names = artistNames;
        if (productSection) (result as any).productSection = productSection;

        // Generate deck (pass generated images)
        const deck = await generateDeck(result, generatedImages);
        campaign.deck = deck.file;
        campaign.progress = 100;
        campaign.status = 'complete';
        campaign.result = result;
        (campaign as any).artistNames = artistNames;
        (campaign as any).artistPhotoDataUris = artistPhotos.map(p => `data:${p.mimeType};base64,${p.base64}`);

        // Save original inputs for full rerun capability
        const inputDir = path.join(CAMPAIGNS_DIR, campaignId, 'inputs');
        fs.mkdirSync(inputDir, { recursive: true });
        // Save mood board images
        const uploadedImgs = fileFields['images'] || [];
        for (let ii = 0; ii < uploadedImgs.length; ii++) {
          const ext = uploadedImgs[ii].mimetype === 'image/png' ? 'png' : 'jpg';
          fs.writeFileSync(path.join(inputDir, `mood-${ii}.${ext}`), uploadedImgs[ii].buffer);
        }
        // Save artist photos
        for (let ii = 0; ii < (fileFields['artist_photos'] || []).length; ii++) {
          const apFile = fileFields['artist_photos'][ii];
          const ext = apFile.mimetype === 'image/png' ? 'png' : 'jpg';
          fs.writeFileSync(path.join(inputDir, `artist-${ii}.${ext}`), apFile.buffer);
        }
        // Save product reference images
        for (let ii = 0; ii < (fileFields['product_refs'] || []).length; ii++) {
          const prFile = fileFields['product_refs'][ii];
          const ext = prFile.mimetype === 'image/png' ? 'png' : 'jpg';
          fs.writeFileSync(path.join(inputDir, `product-${ii}.${ext}`), prFile.buffer);
        }
        // Save reference decks
        for (let ii = 0; ii < refDecks.length; ii++) {
          fs.writeFileSync(path.join(inputDir, `deck-${ii}.pdf`), refDecks[ii].buffer);
        }
        // Save metadata
        fs.writeFileSync(path.join(inputDir, 'meta.json'), JSON.stringify({
          artistNames,
          textBrief,
          pinterestUrl: pinterestUrl || null,
          youtubeUrls,
          starredIndices: Array.from(starredIndices),
          fontDirections,
        }, null, 2));
        console.log(`Saved inputs to ${inputDir}`);

        saveCampaign(campaign);

      } catch (e: any) {
        console.error('Campaign processing failed:', e);
        campaign.status = 'error';
        campaign.error = e.message;
        saveCampaign(campaign);
      }
    })();

  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// List all campaigns (without heavy data like images/deck)
app.get('/api/campaigns', (_req, res) => {
  const list = Array.from(campaigns.values()).map(c => ({
    id: c.id,
    status: c.status,
    progress: c.progress,
    createdAt: c.created_at,
    created_at: c.created_at,
    manifesto: c.result?.synthesis?.manifesto?.slice(0, 200),
    artistNames: (c.result?.synthesis as any)?.artist_names || (c as any).artistNames || [],
    image_count: c.result?.image_count,
    has_generated_images: (c.generatedImages?.length || 0) > 0,
    error: c.error,
  }));
  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ campaigns: list });
});

app.get('/api/campaigns/:id', (req, res) => {
  let campaign = campaigns.get(req.params.id);
  if (!campaign) {
    campaign = loadCampaign(req.params.id) || undefined;
    if (campaign) campaigns.set(req.params.id, campaign);
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  res.json({
    status: campaign.status,
    progress: campaign.progress,
    result: campaign.status === 'complete' ? campaign.result : undefined,
    generatedImages: campaign.status === 'complete' ? campaign.generatedImages : undefined,
    error: campaign.error,
  });
});

app.get('/api/campaigns/:id/deck', (req, res) => {
  let campaign = campaigns.get(req.params.id);
  if (!campaign) {
    campaign = loadCampaign(req.params.id) || undefined;
    if (campaign) campaigns.set(req.params.id, campaign);
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'complete' || !campaign.deck) {
    return res.status(400).json({ error: 'Deck not ready' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="cultural-graph-${campaign.id}.pdf"`);
  res.send(campaign.deck);
});

// ── PPTX EXPORT ──
app.get('/api/campaigns/:id/deck.pptx', async (req, res) => {
  let campaign = campaigns.get(req.params.id);
  if (!campaign) {
    campaign = loadCampaign(req.params.id) || undefined;
    if (campaign) campaigns.set(req.params.id, campaign);
  }
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'complete' || !campaign.result) {
    return res.status(400).json({ error: 'Deck not ready' });
  }

  try {
    const PptxGenJS = require('pptxgenjs');
    const puppeteer = require('puppeteer');
    const { assembleDeckHtmls } = require('@cultural-graph/deck-generator');

    // Re-generate slide HTMLs from the campaign analysis
    const slideHtmls = assembleDeckHtmls(campaign.result, {
      generatedImages: campaign.generatedImages,
      artistPhotos: (campaign as any).artistPhotoDataUris,
    });

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    for (let i = 0; i < slideHtmls.length; i++) {
      await page.setContent(slideHtmls[i], { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }) as string;

      const slide = pptx.addSlide();
      slide.addImage({ data: `image/png;base64,${screenshot}`, x: 0, y: 0, w: '100%', h: '100%' });

      if ((i + 1) % 10 === 0) console.log(`  PPTX: rendered ${i + 1}/${slideHtmls.length}`);
    }

    await browser.close();

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="contexx-${campaign.id}.pptx"`);
    res.send(pptxBuffer);
  } catch (e: any) {
    console.error('PPTX export failed:', e.message);
    res.status(500).json({ error: 'PPTX export failed: ' + e.message });
  }
});

// ── RECOGNITION ENGINE — Bulk cultural node recognition ──
const recognitionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── PINTEREST SCRAPE — returns images as base64 for client-side curation ──
app.post('/api/scrape-pinterest', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });
    console.log(`Scraping Pinterest: ${url}`);
    const board = await scrapePinterestBoard(url);
    const images = board.images.map(img => ({
      base64: img.buffer.toString('base64'),
      mimeType: 'image/jpeg',
    }));
    cleanupPinterestFiles(board);
    console.log(`Pinterest: scraped ${images.length} images`);
    res.json({ images, count: images.length });
  } catch (e: any) {
    console.error('Pinterest scrape failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recognize', recognitionUpload.array('images', 30), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return res.status(400).json({ error: 'No images uploaded' });

    console.log(`Recognition engine: ${files.length} images received`);

    const images = files.map(f => ({
      base64: f.buffer.toString('base64'),
      mimeType: f.mimetype,
    }));

    // Stage 1: Bulk recognition
    const recognition = await recognizeAll(images, {
      concurrency: 3,
      onProgress: (done, total) => console.log(`  Recognition: ${done}/${total}`),
    });

    // Stage 2: Cross-reference analysis
    const crossRef = crossReference(recognition);

    console.log(`Recognition complete: ${crossRef.totalUnique} unique nodes (${crossRef.commonalities.length} commonalities, ${crossRef.anomalies.length} anomalies)`);

    res.json({
      nodes: crossRef.nodes.map(n => ({
        id: n.node.id,
        name: n.node.name,
        category: n.node.category,
        categoryName: n.node.categoryName,
        specificity: n.node.specificity,
        frequency: n.frequency,
        type: n.type,
        weight: n.weight,
        imageIndices: n.imageIndices,
        confidence: n.node.confidence,
      })),
      commonalities: crossRef.commonalities.length,
      anomalies: crossRef.anomalies.length,
      totalNodes: crossRef.totalUnique,
      categoryBreakdown: crossRef.categoryBreakdown,
    });
  } catch (e: any) {
    console.error('Recognition failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Store recognition results per campaign for the curation step
const recognitionCache = new Map<string, any>();

app.post('/api/campaigns/:id/recognize', async (req, res) => {
  try {
    const campaign = campaigns.get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Get images from campaign inputs
    const inputDir = path.join(CAMPAIGNS_DIR, req.params.id, 'inputs');
    const images: Array<{ base64: string; mimeType: string }> = [];

    // Load uploaded mood board images
    if (campaign.uploadedImages) {
      for (const img of campaign.uploadedImages) {
        images.push({ base64: img.base64, mimeType: img.mimeType || 'image/jpeg' });
      }
    }

    // Load Pinterest images if available
    if (campaign.pinterestImages) {
      for (const img of campaign.pinterestImages) {
        if (img.base64) images.push({ base64: img.base64, mimeType: 'image/jpeg' });
      }
    }

    if (!images.length) return res.status(400).json({ error: 'No images to analyze' });

    console.log(`Recognition engine for campaign ${req.params.id}: ${images.length} images`);

    const recognition = await recognizeAll(images, { concurrency: 3 });
    const crossRef = crossReference(recognition);

    // Cache for curation step
    recognitionCache.set(req.params.id, crossRef);

    // Save to campaign
    campaign.recognitionResult = crossRef;
    const campaignDir = path.join(CAMPAIGNS_DIR, req.params.id);
    fs.writeFileSync(path.join(campaignDir, 'campaign.json'), JSON.stringify(campaign));

    res.json({
      nodes: crossRef.nodes.map(n => ({
        id: n.node.id,
        name: n.node.name,
        category: n.node.category,
        categoryName: n.node.categoryName,
        specificity: n.node.specificity,
        frequency: n.frequency,
        type: n.type,
        weight: n.weight,
        imageIndices: n.imageIndices,
      })),
      commonalities: crossRef.commonalities.length,
      anomalies: crossRef.anomalies.length,
      totalNodes: crossRef.totalUnique,
    });
  } catch (e: any) {
    console.error('Campaign recognition failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── REBUILD DECK (re-assemble with current images after regeneration) ──
app.post('/api/campaigns/:id/rebuild-deck', async (req, res) => {
  try {
    const campaign = campaigns.get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.result) return res.status(400).json({ error: 'No analysis result to rebuild from' });

    console.log(`Rebuilding deck for ${req.params.id}...`);

    const result = campaign.result;
    const generatedImages = campaign.generatedImages || [];

    // Re-assemble deck with current images (including regenerated ones)
    const deck = await generateDeck(result, generatedImages);
    campaign.deck = deck.file;

    // Save
    const campaignDir = path.join(CAMPAIGNS_DIR, req.params.id);
    fs.mkdirSync(campaignDir, { recursive: true });
    fs.writeFileSync(path.join(campaignDir, 'campaign.json'), JSON.stringify(campaign));
    fs.writeFileSync(path.join(campaignDir, 'deck.pdf'), deck.file);

    console.log(`✓ Deck rebuilt for ${req.params.id}`);
    res.json({ success: true, slides: (deck as any).slideCount || 0 });
  } catch (e: any) {
    console.error('Deck rebuild failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── REGENERATE SINGLE IMAGE ──
const regenUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.post('/api/campaigns/:id/regenerate-image/:imageIndex', regenUpload.single('reference_image'), async (req, res) => {
  try {
    const campaign = campaigns.get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.generatedImages?.length) return res.status(400).json({ error: 'No images to regenerate' });

    const idx = parseInt(req.params.imageIndex);
    if (isNaN(idx) || idx < 0 || idx >= campaign.generatedImages.length) {
      return res.status(400).json({ error: 'Invalid image index' });
    }

    const oldImage = campaign.generatedImages[idx];
    const mode = req.body?.mode || 'prompt_edit'; // quick_reroll | prompt_edit | reference_driven
    const newPrompt = req.body?.prompt || oldImage.prompt;

    // Build style refs for Gemini
    const styleRefs: { base64: string; mimeType: string }[] = [];
    if (req.file) {
      // Reference image uploaded
      styleRefs.push({ base64: req.file.buffer.toString('base64'), mimeType: req.file.mimetype });
    }

    // Import generateSingleImage dynamically
    const { GoogleGenAI } = require('@google/genai');
    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Build Gemini request parts
    const parts: any[] = [];

    // Pass the current image so Gemini knows what we're working from
    parts.push({ text: 'CURRENT IMAGE (regenerate this):' });
    parts.push({ inlineData: { data: oldImage.base64, mimeType: 'image/png' } });

    // Add uploaded reference image if provided
    if (styleRefs.length > 0) {
      parts.push({ text: 'REFERENCE IMAGE (match this style/environment):' });
      for (const ref of styleRefs) {
        parts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
      }
    }

    // Add prompt
    parts.push({ text: newPrompt });

    console.log(`Regenerating image ${idx} (${oldImage.category}) — mode: ${mode}`);

    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Extract image from response
    let newBase64: string | null = null;
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        newBase64 = part.inlineData.data;
        break;
      }
    }

    if (!newBase64) {
      return res.status(500).json({ error: 'Image generation failed — no image in response' });
    }

    // Store old image in history
    if (!oldImage.generation_history) oldImage.generation_history = [];
    oldImage.generation_history.push({
      base64: oldImage.base64,
      prompt: oldImage.prompt,
      timestamp: new Date().toISOString(),
    });

    // Update image
    oldImage.base64 = newBase64;
    oldImage.prompt = newPrompt;
    oldImage.regenerated = true;

    // Save campaign
    const campaignDir = path.join(CAMPAIGNS_DIR, req.params.id);
    fs.mkdirSync(campaignDir, { recursive: true });
    fs.writeFileSync(path.join(campaignDir, 'campaign.json'), JSON.stringify(campaign));

    console.log(`✓ Regenerated image ${idx} (${oldImage.category})`);

    res.json({
      image_index: idx,
      category: oldImage.category,
      base64: newBase64,
      prompt: newPrompt,
      history_count: oldImage.generation_history.length,
    });
  } catch (e: any) {
    console.error('Regeneration failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── REVERT IMAGE TO PREVIOUS VERSION ──
app.post('/api/campaigns/:id/revert-image/:imageIndex', (req, res) => {
  try {
    const campaign = campaigns.get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const idx = parseInt(req.params.imageIndex);
    if (isNaN(idx) || idx < 0 || idx >= campaign.generatedImages.length) {
      return res.status(400).json({ error: 'Invalid image index' });
    }

    const image = campaign.generatedImages[idx];
    if (!image.generation_history?.length) {
      return res.status(400).json({ error: 'No history to revert to' });
    }

    // Pop last version from history
    const previous = image.generation_history.pop();
    image.base64 = previous.base64;
    image.prompt = previous.prompt;

    // Save
    const campaignDir = path.join(CAMPAIGNS_DIR, req.params.id);
    fs.writeFileSync(path.join(campaignDir, 'campaign.json'), JSON.stringify(campaign));

    res.json({
      image_index: idx,
      category: image.category,
      base64: previous.base64,
      prompt: previous.prompt,
      history_count: image.generation_history.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── RERUN CAMPAIGN (full re-analysis from saved inputs) ──
app.post('/api/campaigns/:id/rerun', async (req, res) => {
  const originalId = req.params.id;
  const inputDir = path.join(CAMPAIGNS_DIR, originalId, 'inputs');
  const metaPath = path.join(inputDir, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'No saved inputs found for this campaign. Only campaigns created after the rerun feature was added can be rerun.' });
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

  const campaignId = uuid();
  const campaign: Campaign = {
    id: campaignId,
    status: 'processing',
    progress: 0,
    created_at: new Date().toISOString(),
  };
  campaigns.set(campaignId, campaign);
  res.status(201).json({ campaign_id: campaignId, status: 'processing', rerun_of: originalId });

  (async () => {
    try {
      console.log(`Full rerun of ${originalId} → ${campaignId}`);

      // Reload saved files from disk
      const inputFiles = fs.readdirSync(inputDir);
      const images: (Buffer | string)[] = [];
      const moodBoardRefs: MoodBoardImage[] = [];
      const artistPhotos: ArtistPhoto[] = [];
      const imageUrls: string[] = [];
      const refDeckBuffers: Buffer[] = [];

      for (const file of inputFiles.sort()) {
        const filePath = path.join(inputDir, file);
        if (file.startsWith('mood-')) {
          const buf = fs.readFileSync(filePath);
          images.push(buf);
          if (moodBoardRefs.length < 20) {
            const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
            moodBoardRefs.push({ base64: buf.toString('base64'), mimeType: mime });
          }
        } else if (file.startsWith('artist-')) {
          const buf = fs.readFileSync(filePath);
          const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
          artistPhotos.push({ base64: buf.toString('base64'), mimeType: mime });
        } else if (file.startsWith('deck-') && file.endsWith('.pdf')) {
          refDeckBuffers.push(fs.readFileSync(filePath));
        }
      }

      // Process reference decks (same as original pipeline)
      if (refDeckBuffers.length > 0) {
        console.log(`Processing ${refDeckBuffers.length} reference deck(s)...`);
        try {
          const puppeteer = require('puppeteer');
          const { PDFDocument } = require('pdf-lib');
          const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
          for (const deckBuf of refDeckBuffers) {
            try {
              const pdfDoc = await PDFDocument.load(deckBuf);
              const pageCount = Math.min(pdfDoc.getPageCount(), 30);
              for (let i = 0; i < pageCount; i++) {
                const singlePdf = await PDFDocument.create();
                const [page] = await singlePdf.copyPages(pdfDoc, [i]);
                singlePdf.addPage(page);
                const bytes = await singlePdf.save();
                const browserPage = await browser.newPage();
                await browserPage.setViewport({ width: 1920, height: 1080 });
                const dataUri = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
                await browserPage.goto(dataUri, { waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
                const screenshot = await browserPage.screenshot({ type: 'jpeg', quality: 80 });
                await browserPage.close();
                images.push(screenshot as Buffer);
                if (moodBoardRefs.length < 20) {
                  moodBoardRefs.push({ base64: (screenshot as Buffer).toString('base64'), mimeType: 'image/jpeg' });
                }
              }
            } catch (e: any) {
              console.warn(`  Failed to process deck: ${e.message}`);
            }
          }
          await browser.close();
        } catch (e: any) {
          console.warn('Reference deck processing failed:', e.message);
        }
      }

      console.log(`Loaded: ${images.length} images, ${artistPhotos.length} artist photos`);
      campaign.progress = 10;

      // Pinterest scrape
      const pinterestDataUrisRerun: string[] = [];
      if (meta.pinterestUrl) {
        try {
          const board = await scrapePinterestBoard(meta.pinterestUrl);
          for (const img of board.images) {
            images.push(img.buffer);
            const b64 = img.buffer.toString('base64');
            if (moodBoardRefs.length < 20) {
              moodBoardRefs.push({ base64: b64, mimeType: 'image/jpeg' });
            }
            pinterestDataUrisRerun.push(`data:image/jpeg;base64,${b64}`);
          }
          console.log(`Pinterest: scraped ${board.images.length} images`);
          cleanupPinterestFiles(board);
        } catch (e: any) {
          console.warn('Pinterest scrape failed:', e.message);
        }
      }
      campaign.progress = 20;

      const artistNames: string[] = meta.artistNames || [];
      const textBrief: string = meta.textBrief || '';
      const youtubeUrls: string[] = meta.youtubeUrls || [];
      const starredIndices: number[] = meta.starredIndices || [];
      const fontDirections: string[] = meta.fontDirections || [];

      // YouTube
      for (const ytUrl of youtubeUrls) {
        try {
          const ytAnalysis = await analyzeYouTubeVideo(ytUrl);
          if (ytAnalysis.thumbnail_url) images.push(ytAnalysis.thumbnail_url);
        } catch (e: any) {
          console.warn('YouTube analysis failed:', e.message);
        }
      }
      campaign.progress = 30;

      if (images.length === 0) throw new Error('No images found in saved inputs');

      // Build enriched brief
      let enrichedBrief = textBrief;
      if (fontDirections.length > 0) {
        const fontMap: Record<string, string> = {
          'grotesque': 'Grotesque sans-serif (Helvetica, Akzidenz — clean, universal, modernist)',
          'neo-grotesk': 'Neo-Grotesk (Neue Haas, Suisse, Untitled — contemporary, tech-forward)',
          'geometric': 'Geometric sans-serif (Futura, Avant Garde — Bauhaus, structural, bold)',
          'humanist': 'Humanist sans-serif (Gill Sans, Frutiger — warm, approachable, organic)',
          'transitional-serif': 'Transitional serif (Times, Baskerville — editorial, literary, classic)',
          'didone': 'Didone/high-contrast serif (Bodoni, Didot — fashion, luxury, dramatic)',
          'slab': 'Slab serif (Rockwell, Clarendon — industrial, bold, vintage)',
          'old-style': 'Old Style serif (Garamond, Caslon — timeless, literary, warm)',
          'mono': 'Monospace (Courier, JetBrains Mono — technical, raw, utilitarian)',
          'handwritten': 'Handwritten/script (brush, marker, calligraphy — personal, DIY, emotional)',
          'display': 'Display/decorative (custom, experimental, bespoke — statement, loud)',
          'blackletter': 'Blackletter/gothic (Fraktur, Old English — metal, streetwear, heritage)',
          'rounded': 'Rounded sans-serif (Nunito, Comfortaa — friendly, playful, soft)',
          'condensed': 'Condensed/compressed (Impact, Knockout — editorial, urgent, high-impact)',
          'brutalist': 'Brutalist/industrial (Druk, GT America — raw, confrontational, heavy)',
          'retro': 'Retro/vintage (Cooper Black, Windsor — 70s, nostalgic, groovy)',
        };
        const fontDescs = fontDirections.map(id => fontMap[id] || id).join('; ');
        enrichedBrief += `\n\nTYPOGRAPHY DIRECTION: The typography for this project should draw from: ${fontDescs}. Use these type families as the foundation for all typography decisions — logo, headlines, body, merch, packaging.`;
      }

      // Full analysis
      const result = await analyzeMoodBoard(images, {
        concurrency: 10,
        artistNames,
        textBrief: enrichedBrief,
        youtubeUrls,
      });

      // Starred images
      const starredDataUris: string[] = [];
      for (const idx of starredIndices) {
        const moodFiles = inputFiles.filter(f => f.startsWith('mood-')).sort();
        if (idx < moodFiles.length) {
          const buf = fs.readFileSync(path.join(inputDir, moodFiles[idx]));
          const mime = moodFiles[idx].endsWith('.png') ? 'image/png' : 'image/jpeg';
          starredDataUris.push(`data:${mime};base64,${buf.toString('base64')}`);
        }
      }
      const allDeckImagesRerun = [...starredDataUris, ...pinterestDataUrisRerun];
      (result as any)._imageUrls = allDeckImagesRerun.length > 0 ? allDeckImagesRerun : imageUrls;
      (result as any)._starredUrls = starredDataUris;

      campaign.progress = 65;

      const primaryArtist = artistNames[0] || textBrief?.split(' ')[0] || 'the artist';
      campaign.progress = 70;

      // Featured images from starred selections
      const featuredImages: MoodBoardImage[] = [];
      const moodFiles = inputFiles.filter(f => f.startsWith('mood-')).sort();
      for (const idx of starredIndices) {
        if (idx < moodFiles.length) {
          const buf = fs.readFileSync(path.join(inputDir, moodFiles[idx]));
          const mime = moodFiles[idx].endsWith('.png') ? 'image/png' : 'image/jpeg';
          featuredImages.push({ base64: buf.toString('base64'), mimeType: mime });
        }
      }

      // Load product refs from saved inputs (needed for both image gen + product direction)
      const productRefImagesRerun: { base64: string; mimeType: string }[] = [];
      for (const f of inputFiles.filter(f => f.startsWith('product-'))) {
        const buf = fs.readFileSync(path.join(inputDir, f));
        const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
        productRefImagesRerun.push({ base64: buf.toString('base64'), mimeType: mime });
      }

      // Generate images
      let generatedImages: any[] = [];
      if (result.synthesis) {
        try {
          console.log('Generating creative direction images...');
          const imgResult = await generateCreativeImages(
            primaryArtist,
            result.synthesis,
            artistPhotos.length > 0 ? artistPhotos : undefined,
            moodBoardRefs.length > 0 ? moodBoardRefs : undefined,
            undefined,
            {
              featuredImages: featuredImages.length > 0 ? featuredImages : undefined,
              productRefImages: productRefImagesRerun.length > 0 ? productRefImagesRerun : undefined,
            },
          );
          generatedImages = imgResult.images;
          campaign.generatedImages = generatedImages;
          console.log(`Generated ${generatedImages.length} images`);
        } catch (e: any) {
          console.warn('Image generation failed (non-fatal):', e.message);
        }
      }
      campaign.progress = 80;

      // Merch
      let productSection: any = null;
      if (result.synthesis) {
        try {
          productSection = await generateProductDirection(
            primaryArtist, result.synthesis, result.touchpoints || {},
            productRefImagesRerun.length > 0 ? productRefImagesRerun : undefined,
          );
          (campaign as any).productSection = productSection;
        } catch (e: any) {
          console.warn('Product design failed (non-fatal):', e.message);
        }
      }
      campaign.progress = 85;

      // Generate logos via nano-banana
      const typDirRerun = fontDirections.length > 0 ? fontDirections.join(', ') : undefined;
      try {
        console.log('Generating logos via nano-banana...');
        const { GoogleGenAI } = require('@google/genai');
        const logoAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const logoStyles = [
          { style: 'primary-wordmark', prompt: `Clean, minimal wordmark logo for "${primaryArtist}". Just the name in a distinctive typeface${typDirRerun ? ` inspired by ${typDirRerun}` : ''}. Black text on pure white background. No icons, no symbols. Typography only.` },
          { style: 'monogram', prompt: `Monogram logo using the initials of "${primaryArtist}". Simple, bold letterform. Black on white. No decoration.` },
          { style: 'condensed-wordmark', prompt: `Condensed/stacked wordmark for "${primaryArtist}". Narrow, vertical arrangement. Black on white. Clean type only.` },
        ];
        for (const ls of logoStyles) {
          try {
            const logoRes = await logoAi.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: [{ role: 'user', parts: [{ text: ls.prompt }] }],
              config: { responseModalities: ['TEXT', 'IMAGE'] },
            });
            for (const part of logoRes.candidates?.[0]?.content?.parts || []) {
              if ((part as any).inlineData) {
                generatedImages.push({
                  id: require('crypto').randomUUID(),
                  base64: (part as any).inlineData.data,
                  prompt: ls.prompt, category: ls.style, section: 'logo',
                });
                break;
              }
            }
          } catch (le: any) {
            console.warn(`  Logo ${ls.style} failed:`, le.message?.slice(0, 100));
          }
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e: any) {
        console.warn('Logo generation failed (non-fatal):', e.message);
      }

      campaign.generatedImages = generatedImages;
      campaign.progress = 90;

      (result as any).artistName = primaryArtist;
      (result as any).artist_names = artistNames;
      if (productSection) (result as any).productSection = productSection;

      const deck = await generateDeck(result, generatedImages);
      campaign.deck = deck.file;
      campaign.progress = 100;
      campaign.status = 'complete';
      campaign.result = result;
      (campaign as any).artistNames = artistNames;
      (campaign as any).artistPhotoDataUris = artistPhotos.map(p => `data:${p.mimeType};base64,${p.base64}`);
      (campaign as any).rerunOf = originalId;

      // Symlink inputs dir so this campaign can also be rerun
      const newCampaignDir = path.join(CAMPAIGNS_DIR, campaignId);
      fs.mkdirSync(newCampaignDir, { recursive: true });
      const newInputDir = path.join(newCampaignDir, 'inputs');
      if (!fs.existsSync(newInputDir)) {
        fs.symlinkSync(inputDir, newInputDir);
      }

      saveCampaign(campaign);
      console.log(`✅ Full rerun ${campaignId} complete (from ${originalId})`);

    } catch (e: any) {
      console.error('Rerun failed:', e);
      campaign.status = 'error';
      campaign.error = e.message;
      saveCampaign(campaign);
    }
  })();
});

// ── GRAPH ──
app.get('/api/graph/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

    const driver = getDriver();
    const session = driver.session();
    try {
      const result = await session.run(
        `CALL db.index.fulltext.queryNodes("node_name_search", $query)
         YIELD node, score
         RETURN node, labels(node) AS labels, score
         LIMIT 10`,
        { query: `${q}~` }
      );
      const results = result.records.map(r => ({
        ...r.get('node').properties,
        _label: r.get('labels')[0],
        _score: r.get('score'),
      }));
      res.json({ results });
    } finally {
      await session.close();
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/graph/node/:label/:id', async (req, res) => {
  try {
    const { label, id } = req.params;
    const driver = getDriver();
    const session = driver.session();
    try {
      const nodeResult = await session.run(
        `MATCH (n {id: $id}) WHERE $label IN labels(n) RETURN n`,
        { id, label }
      );
      if (nodeResult.records.length === 0) return res.status(404).json({ error: 'Node not found' });

      const relResult = await session.run(
        `MATCH (n {id: $id})-[r]-(other)
         RETURN type(r) AS type, r, other.id AS otherId, other.name AS otherName, labels(other)[0] AS otherLabel`,
        { id }
      );

      const node = nodeResult.records[0].get('n').properties;
      const relationships = relResult.records.map(r => ({
        type: r.get('type'),
        properties: r.get('r').properties,
        target: { id: r.get('otherId'), name: r.get('otherName'), label: r.get('otherLabel') },
      }));

      res.json({ node, relationships });
    } finally {
      await session.close();
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/graph/neighbors/:label/:id', async (req, res) => {
  try {
    const { label, id } = req.params;
    const depth = Math.min(parseInt(req.query.depth as string) || 1, 3);
    const driver = getDriver();
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (n {id: $id})-[*1..${depth}]-(other)
         WHERE other <> n AND $label IN labels(n)
         RETURN DISTINCT other, labels(other)[0] AS label`,
        { id, label }
      );
      const nodes = result.records.map(r => ({ ...r.get('other').properties, _label: r.get('label') }));

      const nodeIds = [id, ...nodes.map((n: any) => n.id)];
      const edgeResult = await session.run(
        `MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS source, b.id AS target, type(r) AS type`,
        { ids: nodeIds }
      );
      const edges = edgeResult.records.map(r => ({
        source: r.get('source'),
        target: r.get('target'),
        type: r.get('type'),
      }));

      res.json({ nodes, edges });
    } finally {
      await session.close();
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/graph/visualization', async (_req, res) => {
  try {
    const driver = getDriver();
    const session = driver.session();
    try {
      const nodeResult = await session.run(
        `MATCH (n) WHERE n.id IS NOT NULL
         RETURN n, labels(n)[0] AS label`
      );
      const nodes = nodeResult.records.map(r => ({
        ...r.get('n').properties,
        _label: r.get('label'),
      }));

      const edgeResult = await session.run(
        `MATCH (a)-[r]->(b) WHERE a.id IS NOT NULL AND b.id IS NOT NULL
         RETURN a.id AS source, b.id AS target, type(r) AS type, r AS properties`
      );
      const edges = edgeResult.records.map(r => ({
        source: r.get('source'),
        target: r.get('target'),
        type: r.get('type'),
        properties: r.get('properties').properties,
      }));

      res.json({ nodes, edges });
    } finally {
      await session.close();
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── INGESTION ──
app.post('/api/graph/ingest', async (req, res) => {
  try {
    const { name, label, depth } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    res.json({ status: 'ingesting', name });

    // Run async — ingestion can take 10-30 seconds per entity
    ingestEntity(name, label, { depth: depth || 1 })
      .then(result => console.log(`Ingestion complete: ${name} → ${result.nodesCreated} nodes, ${result.relationshipsCreated} rels`))
      .catch(e => console.error(`Ingestion failed: ${name}:`, e.message));

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/graph/ingest/batch', async (req, res) => {
  try {
    const { entities, depth } = req.body;
    if (!entities || !Array.isArray(entities)) return res.status(400).json({ error: 'entities array is required' });

    res.json({ status: 'ingesting', count: entities.length });

    ingestMultiple(entities, { depth: depth || 1 })
      .then(result => console.log(`Batch ingestion complete: ${result.total_nodes} nodes, ${result.total_relationships} rels`))
      .catch(e => console.error('Batch ingestion failed:', e.message));

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// MOCK UP — standalone artist-into-reference-scene generator
// ══════════════════════════════════════════════════════════════

const mockupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 500 } });

const mockupFields = mockupUpload.fields([
  { name: 'artist_photos', maxCount: 50 },
  { name: 'reference_photos', maxCount: 500 },
  { name: 'reference_photo', maxCount: 1 },
]);

// Describe artist once per session — detailed physical description for consistent face/body placement
async function describeArtist(photos: ArtistPhoto[]): Promise<string> {
  // Fixed prompt — no external API call needed.
  // Gemini already sees the actual artist photos in every generation call,
  // so the text description just anchors the prompt to "the person shown above."
  if (photos.length === 0) return 'the artist';
  return 'the person shown in the ARTIST PHOTOS above';
}

// Track mockup generation progress per session
const mockupProgress: Map<string, { done: number; total: number; phase: string }> = new Map();

function buildMockupPrompt(artistDesc: string, mode: string = 'scene'): string {
  if (mode === 'wardrobe') {
    return `TASK: There are TWO different people in this prompt. The ARTIST PHOTOS above show ${artistDesc} — this is the SUBJECT who must appear in the final image. The REFERENCE IMAGE below shows a DIFFERENT person wearing an outfit. Take the clothing, accessories, and styling from the person in the REFERENCE IMAGE and put them on ${artistDesc} from the ARTIST PHOTOS. The final image must show ${artistDesc}'s face, hair, skin tone, and body — wearing the exact outfit from the reference. Match the fabric, fit, color, layering, and accessories precisely. Show full body head to toe. The output must be a newly generated photo of the artist in those clothes — NOT the reference person. No text, no watermarks.`;
  }
  return `TASK: Generate a NEW photo that places ${artistDesc} into the scene from the reference image. Use the ARTIST PHOTOS above to capture their face, skin tone, hair, and body accurately. The output must show THIS PERSON in the reference scene — same lighting, color grade, framing, composition, depth of field, grain, texture, surfaces, atmosphere, and style. The output must be a new generated image — NOT the reference image unchanged. No text, no watermarks.`;
}

async function generateOneMockup(
  artistDesc: string,
  artistPhotos: ArtistPhoto[],
  refImage: { base64: string; mimeType: string },
  mode: string = 'scene',
): Promise<{ id: string; base64: string } | null> {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contentParts: any[] = [];

  // Resize artist photos for Gemini (full-res = too large, cap at 1024px)
  const sharpLib = require('sharp');
  contentParts.push(mode === 'wardrobe'
    ? 'ARTIST PHOTOS — this is the SUBJECT. Study their face, skin tone, hair, and body carefully. This person must appear in the final image wearing the clothes from the reference below:'
    : 'ARTIST PHOTOS — study these carefully. This is the person who MUST appear in the generated image. Memorize their face, skin tone, hair, and features:');
  for (const photo of artistPhotos) {
    try {
      const buf = Buffer.from(photo.base64, 'base64');
      const small = await sharpLib(buf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      contentParts.push({ inlineData: { data: small.toString('base64'), mimeType: 'image/jpeg' } });
    } catch {
      contentParts.push({ inlineData: { data: photo.base64, mimeType: photo.mimeType } });
    }
  }

  // The reference scene (resize too)
  contentParts.push(mode === 'wardrobe'
    ? 'REFERENCE IMAGE — this shows a DIFFERENT person wearing an outfit. Take ONLY the clothes, accessories, and styling from this person and put them on the artist above:'
    : 'REFERENCE IMAGE — use this as the scene/setting. Generate a NEW image that looks like this photo but with the artist from above as the subject:');
  try {
    const refBuf = Buffer.from(refImage.base64, 'base64');
    const smallRef = await sharpLib(refBuf).resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    contentParts.push({ inlineData: { data: smallRef.toString('base64'), mimeType: 'image/jpeg' } });
  } catch {
    contentParts.push({ inlineData: { data: refImage.base64, mimeType: refImage.mimeType } });
  }

  contentParts.push(buildMockupPrompt(artistDesc, mode));

  const IMAGE_MODELS = ['gemini-3-pro-image-preview', 'nano-banana-pro-preview', 'gemini-2.5-flash-image'];
  const parts = contentParts.map((p: any) => typeof p === 'string' ? { text: p } : p);

  for (const model of IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });

      const candidates = response.candidates;
      if (!candidates?.length) continue;

      for (const part of candidates[0].content?.parts || []) {
        if ((part as any).inlineData) {
          return { id: uuid(), base64: (part as any).inlineData.data };
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('429') || msg.includes('quota')) {
        console.warn(`  ⚠ ${model} quota exceeded, trying next model...`);
        continue;
      }
      console.error(`  ✗ ${model} failed:`, msg.slice(0, 200));
      return null;
    }
  }
  console.error(`  ✗ All image models exhausted`);
  return null;
}

// Normalize image buffer: convert HEIC/HEIF/unsupported formats to JPEG
async function normalizeImage(buffer: Buffer, mimetype: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const dominated = mimetype.toLowerCase();
  const isHeic = dominated.includes('heic') || dominated.includes('heif');
  
  if (isHeic) {
    // sharp can't decode HEIC — use heic-convert
    const heicConvert = require('heic-convert');
    const converted = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
    return { buffer: Buffer.from(converted), mimeType: 'image/jpeg' };
  }
  
  // For other unusual formats, try sharp
  const needsConvert = dominated === 'image/avif' || dominated === 'application/octet-stream' || dominated === 'image/tiff';
  if (needsConvert) {
    const sharpLib = require('sharp');
    const converted = await sharpLib(buffer).jpeg({ quality: 90 }).toBuffer();
    return { buffer: converted, mimeType: 'image/jpeg' };
  }
  
  // Also sniff HEIC magic bytes in case mimetype is wrong (e.g. application/octet-stream)
  if (buffer.length > 12) {
    const ftypOffset = buffer.indexOf('ftyp');
    if (ftypOffset >= 0 && ftypOffset <= 8) {
      const brand = buffer.slice(ftypOffset + 4, ftypOffset + 8).toString('ascii');
      if (['heic', 'heix', 'mif1'].includes(brand)) {
        const heicConvert = require('heic-convert');
        const converted = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
        return { buffer: Buffer.from(converted), mimeType: 'image/jpeg' };
      }
    }
  }
  
  return { buffer, mimeType: mimetype };
}

// ── Rate limiting for mockup endpoints ──
const mockupRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a minute before trying again' },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

app.use('/api/mockup', mockupRateLimit);

// ── Payment session middleware ──
async function requireActiveSession(req: any, res: any, next: any) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(402).json({ error: 'Payment required', needsPayment: true });
  }
  const result = await validateStripeSession(sessionId);
  if (!result.valid) {
    return res.status(402).json({ error: 'Payment required', needsPayment: true });
  }
  next();
}

// POST /api/mockup — generate 30 mockups
app.post('/api/mockup', mockupFields, requireActiveSession, async (req: any, res) => {
  try {
    const artistFiles = req.files?.['artist_photos'] || [];
    const refFiles = req.files?.['reference_photos'] || [];
    const count = Math.min(parseInt(req.body?.count || '30', 10), 50);
    const mockupMode = req.body?.mode || 'scene';

    if (artistFiles.length === 0) return res.status(400).json({ error: 'No artist photos' });
    if (refFiles.length === 0) return res.status(400).json({ error: 'No reference photos' });

    const sessionId = req.body?.session_id || uuid();
    console.log(`\n🎭 Mockup session ${sessionId} [${mockupMode}]: ${artistFiles.length} artist photos, ${refFiles.length} references, generating ${count}`);

    // Convert to base64, normalizing HEIC/HEIF to JPEG (skip files that fail)
    const artistResults = await Promise.allSettled(artistFiles.map(async (f: any) => {
      const norm = await normalizeImage(f.buffer, f.mimetype);
      return { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType } as ArtistPhoto;
    }));
    const artistPhotos: ArtistPhoto[] = artistResults.filter((r): r is PromiseFulfilledResult<ArtistPhoto> => r.status === 'fulfilled').map(r => r.value);
    const artistFailed = artistResults.filter(r => r.status === 'rejected').length;
    if (artistFailed) console.log(`  ⚠ ${artistFailed} artist photo(s) failed to convert`);

    const refResults = await Promise.allSettled(refFiles.map(async (f: any) => {
      const norm = await normalizeImage(f.buffer, f.mimetype);
      return { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType };
    }));
    const allRefs = refResults.filter((r): r is PromiseFulfilledResult<{base64:string;mimeType:string}> => r.status === 'fulfilled').map(r => r.value);
    const refFailed = refResults.filter(r => r.status === 'rejected').length;
    if (refFailed) console.log(`  ⚠ ${refFailed} reference photo(s) failed to convert`);

    if (artistPhotos.length === 0) return res.status(400).json({ error: 'All artist photos failed to process' });
    if (allRefs.length === 0) return res.status(400).json({ error: 'All reference photos failed to process' });

    // Randomly select `count` references (or all if fewer)
    const shuffled = [...allRefs].sort(() => Math.random() - 0.5);
    const selectedRefs = shuffled.slice(0, count);

    // Describe artist once
    const artistDesc = await describeArtist(artistPhotos);
    console.log(`  Artist: ${artistDesc}`);

    // Track progress
    mockupProgress.set(sessionId, { done: 0, total: count, phase: 'generating' });

    // Resize oversized images
    const sharp = require('sharp');
    const MAX_BYTES = 4.5 * 1024 * 1024;

    async function ensureSize(img: { base64: string; mimeType: string }): Promise<{ base64: string; mimeType: string }> {
      if (img.base64.length * 0.75 <= MAX_BYTES) return img;
      const buf = Buffer.from(img.base64, 'base64');
      const resized = await sharp(buf).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
    }

    const safeArtist = await Promise.all(artistPhotos.map(ensureSize));
    const safeRefs = await Promise.all(selectedRefs.map(ensureSize));

    // Generate all mockups — 2 concurrent (lower to avoid rate limits)
    const results: { id: string; base64: string; refIndex: number }[] = [];
    const failedRefs: { ref: any; idx: number }[] = [];
    const concurrency = 2;

    for (let i = 0; i < safeRefs.length; i += concurrency) {
      const batch = safeRefs.slice(i, i + concurrency);
      const promises = batch.map((ref, j) => {
        const idx = i + j;
        console.log(`  [${idx + 1}/${safeRefs.length}] Generating mockup...`);
        return generateOneMockup(artistDesc, safeArtist as ArtistPhoto[], ref, mockupMode).then(result => {
          const prog = mockupProgress.get(sessionId);
          if (result) {
            results.push({ ...result, refIndex: idx });
            if (prog) { prog.done++; mockupProgress.set(sessionId, prog); }
            console.log(`  ✓ Mockup ${idx + 1}`);
          } else {
            failedRefs.push({ ref, idx });
            if (prog) { prog.done++; mockupProgress.set(sessionId, prog); }
            console.log(`  ✗ Mockup ${idx + 1} failed — will retry`);
          }
        });
      });
      await Promise.all(promises);
      // Brief pause between batches to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    // Retry failures with fresh random refs from the pool
    if (failedRefs.length > 0) {
      console.log(`  🔄 Retrying ${failedRefs.length} failed mockups with new references...`);
      const unusedRefs = shuffled.slice(count).filter(r => safeRefs.indexOf(r) === -1);
      for (let i = 0; i < failedRefs.length; i++) {
        const retryRef = unusedRefs[i] || safeRefs[Math.floor(Math.random() * safeRefs.length)];
        const safeRetryRef = await ensureSize(retryRef);
        console.log(`  [retry ${i + 1}/${failedRefs.length}] Generating mockup...`);
        await new Promise(r => setTimeout(r, 2000)); // longer pause for retries
        const result = await generateOneMockup(artistDesc, safeArtist as ArtistPhoto[], safeRetryRef, mockupMode);
        if (result) {
          results.push({ ...result, refIndex: failedRefs[i].idx });
          console.log(`  ✓ Retry ${i + 1} succeeded`);
        } else {
          console.log(`  ✗ Retry ${i + 1} failed again`);
        }
      }
    }

    console.log(`  🎭 Generated ${results.length}/${safeRefs.length} mockups`);

    // Save session for reruns
    const sessionDir = path.join(__dirname, '../../../data/mockups', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    // Save artist photos for rerun
    fs.writeFileSync(path.join(sessionDir, 'artist.json'), JSON.stringify({ artistDesc }));

    res.json({
      sessionId,
      images: results.sort((a, b) => a.refIndex - b.refIndex),
      total: safeRefs.length,
      generated: results.length,
    });
  } catch (e: any) {
    console.error('Mockup generation failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mockup/rerun-single — regenerate one mockup
app.post('/api/mockup/rerun-single', mockupFields, requireActiveSession, async (req: any, res) => {
  try {
    const artistFiles = req.files?.['artist_photos'] || [];
    const refFile = req.files?.['reference_photo']?.[0];

    const rerunMode = req.body?.mode || 'scene';

    if (artistFiles.length === 0) return res.status(400).json({ error: 'No artist photos' });
    if (!refFile) return res.status(400).json({ error: 'No reference photo' });

    const artistPhotos: ArtistPhoto[] = await Promise.all(artistFiles.map(async (f: any) => {
      const norm = await normalizeImage(f.buffer, f.mimetype);
      return { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType };
    }));

    const normRef = await normalizeImage(refFile.buffer, refFile.mimetype);
    const refImage = { base64: normRef.buffer.toString('base64'), mimeType: normRef.mimeType };
    const artistDesc = await describeArtist(artistPhotos);

    const result = await generateOneMockup(artistDesc, artistPhotos, refImage, rerunMode);

    if (result) {
      res.json({ image: result });
    } else {
      res.status(500).json({ error: 'Generation failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mockup/progress/:sessionId
app.get('/api/mockup/progress/:sessionId', (req, res) => {
  const prog = mockupProgress.get(req.params.sessionId);
  res.json(prog || { done: 0, total: 0 });
});

// Stored mockup decks — persisted to disk so server restarts don't lose them
const DECK_DIR = path.join(__dirname, '..', '..', '..', 'data', 'mockup-decks');
if (!fs.existsSync(DECK_DIR)) fs.mkdirSync(DECK_DIR, { recursive: true });

function saveMockupDeck(deckId: string, pdfBuffer: Buffer, slideImages: string[]) {
  const dir = path.join(DECK_DIR, deckId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.pdf'), pdfBuffer);
  fs.writeFileSync(path.join(dir, 'slides.json'), JSON.stringify(slideImages));
}

function saveSlidePng(deckId: string, index: number, pngBuffer: Buffer) {
  const dir = path.join(DECK_DIR, deckId, 'pngs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `slide-${index}.png`), pngBuffer);
}

function loadSlidePngs(deckId: string): Buffer[] {
  const dir = path.join(DECK_DIR, deckId, 'pngs');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  return files.map(f => fs.readFileSync(path.join(dir, f)));
}

function loadMockupDeck(deckId: string): { pdfBuffer: Buffer; slideImages: string[] } | null {
  const dir = path.join(DECK_DIR, deckId);
  const pdfPath = path.join(dir, 'deck.pdf');
  const slidesPath = path.join(dir, 'slides.json');
  if (!fs.existsSync(pdfPath)) return null;
  return {
    pdfBuffer: fs.readFileSync(pdfPath),
    slideImages: fs.existsSync(slidesPath) ? JSON.parse(fs.readFileSync(slidesPath, 'utf-8')) : [],
  };
}

// POST /api/mockup/deck — generate deck, return slide previews
app.post('/api/mockup/deck', async (req, res) => {
  try {
    const { images, sessionId } = req.body;
    if (!images?.length) return res.status(400).json({ error: 'No images' });

    const deckId = uuid();
    console.log(`\n📄 Generating mockup deck ${deckId}: ${images.length} images`);

    const puppeteer = require('puppeteer');
    const { PDFDocument } = require('pdf-lib');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    // Detect image orientations using sharp
    const sharp = require('sharp');
    interface ClassifiedImage { base64: string; id: string; orientation: 'portrait' | 'landscape' | 'square'; }
    const classified: ClassifiedImage[] = [];

    for (const img of images) {
      try {
        const buf = Buffer.from(img.base64, 'base64');
        const meta = await sharp(buf).metadata();
        const w = meta.width || 1;
        const h = meta.height || 1;
        const ratio = w / h;
        const orientation = ratio < 0.85 ? 'portrait' : ratio > 1.15 ? 'landscape' : 'square';
        classified.push({ base64: img.base64, id: img.id, orientation });
      } catch {
        classified.push({ base64: img.base64, id: img.id, orientation: 'landscape' });
      }
    }

    const portraits = classified.filter(i => i.orientation === 'portrait');
    const landscapes = classified.filter(i => i.orientation === 'landscape');
    const squares = classified.filter(i => i.orientation === 'square');

    console.log(`  Orientations: ${portraits.length} portrait, ${landscapes.length} landscape, ${squares.length} square`);

    const S = `* { margin:0; padding:0; box-sizing:border-box; }`;
    const I = `width:100%;height:100%;object-fit:cover;object-position:top center;display:block;`;

    function slide(bodyStyle: string, content: string): string {
      return `<!DOCTYPE html><html><head><style>${S} body { width:1920px; height:1080px; background:#000; overflow:hidden; ${bodyStyle} }</style></head><body>${content}</body></html>`;
    }
    function img(b64: string, extra?: string): string {
      return `<div style="overflow:hidden;${extra || ''}"><img src="data:image/png;base64,${b64}" style="${I}" /></div>`;
    }

    // Interleave portraits and landscapes for visual variety
    const all = [...classified];
    const slideHtmls: string[] = [];
    let idx = 0;

    // Layout sequence for diversity:
    // 1. Full bleed hero
    // 2. 2×2 grid (4 images)
    // 3. Full bleed feature
    // 4. 3-up portraits OR 3-column landscape
    // 5. 2-up (50/50 split)
    // 6. Full bleed feature
    // 7. 2×2 grid
    // 8. 1 big + 2 small (1 left, 2 stacked right)
    // 9. 3-up
    // 10. Full bleed
    // ... repeat pattern

    const layouts = [
      'hero', 'trio', 'hero', 'duo', 'split-1-2', 'hero', 'trio', 'duo', 'hero', 'split-1-2',
      'trio', 'hero', 'duo', 'hero', 'trio', 'split-1-2', 'hero', 'duo', 'trio', 'hero',
    ];

    for (const layout of layouts) {
      if (idx >= all.length) break;

      switch (layout) {
        case 'hero': {
          // Full bleed single image
          const im = all[idx++];
          slideHtmls.push(slide('', img(im.base64, 'width:100%;height:100%;')));
          break;
        }
        case 'trio': {
          // 3 images side by side
          const batch = all.slice(idx, idx + 3);
          if (batch.length === 0) break;
          idx += batch.length;
          slideHtmls.push(slide(
            `display:grid; grid-template-columns:repeat(${batch.length},1fr); grid-template-rows:1fr; gap:2px;`,
            batch.map(im => img(im.base64)).join('')
          ));
          break;
        }
        case 'duo': {
          // 2 images 50/50
          const batch = all.slice(idx, idx + 2);
          if (batch.length === 0) break;
          idx += batch.length;
          slideHtmls.push(slide(
            `display:grid; grid-template-columns:repeat(${batch.length},1fr); grid-template-rows:1fr; gap:2px;`,
            batch.map(im => img(im.base64)).join('')
          ));
          break;
        }
        case 'split-1-2': {
          // 1 big left + 2 stacked right
          const batch = all.slice(idx, idx + 3);
          if (batch.length === 0) break;
          idx += batch.length;
          if (batch.length === 1) {
            slideHtmls.push(slide('', img(batch[0].base64, 'width:100%;height:100%;')));
          } else if (batch.length === 2) {
            slideHtmls.push(slide(
              `display:grid; grid-template-columns:repeat(2,1fr); grid-template-rows:1fr; gap:2px;`,
              batch.map(im => img(im.base64)).join('')
            ));
          } else {
            slideHtmls.push(slide(
              `display:grid; grid-template-columns:1.2fr 0.8fr; grid-template-rows:1fr 1fr; gap:2px;`,
              img(batch[0].base64, 'grid-row:1/3;') + img(batch[1].base64) + img(batch[2].base64)
            ));
          }
          break;
        }
      }
    }

    // Render each slide to PNG (for preview) and build PDF
    const pdfDoc = await PDFDocument.create();
    const slideImages: string[] = [];

    for (let i = 0; i < slideHtmls.length; i++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setContent(slideHtmls[i], { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 500));

      const pngBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });

      // Create small preview for the JSON response
      const sharpLib = require('sharp');
      const previewBuffer = await sharpLib(pngBuffer).resize(640, 360).jpeg({ quality: 60 }).toBuffer();
      slideImages.push(previewBuffer.toString('base64'));

      // Save full-res PNG for PPTX export
      saveSlidePng(deckId, i, Buffer.from(pngBuffer));

      const pngImage = await pdfDoc.embedPng(pngBuffer);
      const pdfPage = pdfDoc.addPage([1920, 1080]);
      pdfPage.drawImage(pngImage, { x: 0, y: 0, width: 1920, height: 1080 });

      await page.close();
      console.log(`  Rendered slide ${i + 1}/${slideHtmls.length}`);
    }

    await browser.close();
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    saveMockupDeck(deckId, pdfBuffer, slideImages);
    console.log(`  ✓ Deck generated: ${slideHtmls.length} pages, ${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    res.json({ deckId, slideCount: slideImages.length, slides: slideImages });
  } catch (e: any) {
    console.error('Deck generation failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mockup/deck/:id/pdf — download PDF
app.get('/api/mockup/deck/:id/pdf', (req, res) => {
  const deck = loadMockupDeck(req.params.id);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="mockup-deck.pdf"');
  res.send(deck.pdfBuffer);
});

// GET /api/mockup/deck/:id/pptx — download PPTX
app.get('/api/mockup/deck/:id/pptx', async (req, res) => {
  try {
    const pngs = loadSlidePngs(req.params.id);
    if (!pngs.length) return res.status(404).json({ error: 'Deck not found' });

    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches

    for (const png of pngs) {
      const slide = pptx.addSlide();
      slide.background = { color: '000000' };
      slide.addImage({
        data: `data:image/png;base64,${png.toString('base64')}`,
        x: 0, y: 0, w: '100%', h: '100%',
      });
    }

    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.set('Content-Disposition', 'attachment; filename="mockup-deck.pptx"');
    res.send(pptxBuffer);
  } catch (e: any) {
    console.error('PPTX generation failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// BATCH MODE — apply same prompt/effect to up to 50 photos
// ══════════════════════════════════════════════════════════════

const batchUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 60 } });
const batchFields = batchUpload.fields([
  { name: 'photos', maxCount: 50 },
  { name: 'reference_photos', maxCount: 10 },
]);

async function generateOneBatchImage(
  photo: { base64: string; mimeType: string },
  prompt: string,
  referenceImages: { base64: string; mimeType: string }[],
): Promise<{ id: string; base64: string } | null> {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const sharpLib = require('sharp');

  const contentParts: any[] = [];

  // The source photo to transform
  contentParts.push({ text: 'SOURCE PHOTO — apply the effect/transformation to this image:' });
  try {
    const buf = Buffer.from(photo.base64, 'base64');
    const small = await sharpLib(buf).resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    contentParts.push({ inlineData: { data: small.toString('base64'), mimeType: 'image/jpeg' } });
  } catch {
    contentParts.push({ inlineData: { data: photo.base64, mimeType: photo.mimeType } });
  }

  // Optional reference images
  if (referenceImages.length > 0) {
    contentParts.push({ text: 'REFERENCE IMAGE(S) — match this style/look/effect:' });
    for (const ref of referenceImages) {
      try {
        const buf = Buffer.from(ref.base64, 'base64');
        const small = await sharpLib(buf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        contentParts.push({ inlineData: { data: small.toString('base64'), mimeType: 'image/jpeg' } });
      } catch {
        contentParts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
      }
    }
  }

  contentParts.push({ text: prompt });

  const IMAGE_MODELS = ['gemini-3-pro-image-preview', 'nano-banana-pro-preview', 'gemini-2.5-flash-image'];

  for (const model of IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: contentParts }],
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });

      const candidates = response.candidates;
      if (!candidates?.length) continue;

      for (const part of candidates[0].content?.parts || []) {
        if ((part as any).inlineData) {
          return { id: uuid(), base64: (part as any).inlineData.data };
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('429') || msg.includes('quota')) {
        console.warn(`  ⚠ ${model} quota exceeded, trying next model...`);
        continue;
      }
      console.error(`  ✗ ${model} failed:`, msg.slice(0, 200));
      return null;
    }
  }
  console.error(`  ✗ All image models exhausted`);
  return null;
}

app.post('/api/mockup/batch', batchFields, requireActiveSession, async (req: any, res) => {
  try {
    const photoFiles = req.files?.['photos'] || [];
    const refFiles = req.files?.['reference_photos'] || [];
    const prompt = req.body?.prompt || '';

    if (photoFiles.length === 0) return res.status(400).json({ error: 'No photos uploaded' });
    if (!prompt.trim() && refFiles.length === 0) return res.status(400).json({ error: 'Need a prompt or reference image' });

    const sessionId = req.body?.session_id || uuid();
    console.log(`\n🔄 Batch session ${sessionId}: ${photoFiles.length} photos, ${refFiles.length} refs, prompt: "${prompt.slice(0, 80)}"`);

    // Normalize all photos
    const photoResults = await Promise.allSettled(photoFiles.map(async (f: any) => {
      const norm = await normalizeImage(f.buffer, f.mimetype);
      return { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType };
    }));
    const photos = photoResults.filter((r): r is PromiseFulfilledResult<{base64:string;mimeType:string}> => r.status === 'fulfilled').map(r => r.value);

    // Normalize reference images
    const refResults = await Promise.allSettled(refFiles.map(async (f: any) => {
      const norm = await normalizeImage(f.buffer, f.mimetype);
      return { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType };
    }));
    const refs = refResults.filter((r): r is PromiseFulfilledResult<{base64:string;mimeType:string}> => r.status === 'fulfilled').map(r => r.value);

    if (photos.length === 0) return res.status(400).json({ error: 'All photos failed to process' });

    // Build the prompt
    let fullPrompt = prompt.trim();
    if (!fullPrompt && refs.length > 0) {
      fullPrompt = 'Apply the style and look from the reference image(s) to this photo. Keep the subject and composition but transform the aesthetic to match the reference.';
    }

    // Track progress
    mockupProgress.set(sessionId, { done: 0, total: photos.length, phase: 'generating' });

    // Generate — 2 concurrent
    const results: { id: string; base64: string; photoIndex: number }[] = [];
    const concurrency = 2;

    for (let i = 0; i < photos.length; i += concurrency) {
      const batch = photos.slice(i, i + concurrency);
      const promises = batch.map((photo, j) => {
        const idx = i + j;
        console.log(`  [${idx + 1}/${photos.length}] Processing...`);
        return generateOneBatchImage(photo, fullPrompt, refs).then(result => {
          const prog = mockupProgress.get(sessionId);
          if (prog) { prog.done++; mockupProgress.set(sessionId, prog); }
          if (result) {
            results.push({ ...result, photoIndex: idx });
            console.log(`  ✓ Photo ${idx + 1}`);
          } else {
            console.log(`  ✗ Photo ${idx + 1} failed`);
          }
        });
      });
      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`  🔄 Batch complete: ${results.length}/${photos.length}`);

    res.json({
      sessionId,
      images: results.sort((a, b) => a.photoIndex - b.photoIndex),
      total: photos.length,
      generated: results.length,
    });
  } catch (e: any) {
    console.error('Batch generation failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/mockup/batch/rerun-single — regenerate one batch image
app.post('/api/mockup/batch/rerun-single', batchFields, requireActiveSession, async (req: any, res) => {
  try {
    const photoFiles = req.files?.['photos'] || [];
    const refFiles = req.files?.['reference_photos'] || [];
    const prompt = req.body?.prompt || '';

    if (photoFiles.length === 0) return res.status(400).json({ error: 'No photo' });

    const norm = await normalizeImage(photoFiles[0].buffer, photoFiles[0].mimetype);
    const photo = { base64: norm.buffer.toString('base64'), mimeType: norm.mimeType };

    const refs = await Promise.all((refFiles || []).map(async (f: any) => {
      const n = await normalizeImage(f.buffer, f.mimetype);
      return { base64: n.buffer.toString('base64'), mimeType: n.mimeType };
    }));

    let fullPrompt = prompt.trim();
    if (!fullPrompt && refs.length > 0) {
      fullPrompt = 'Apply the style and look from the reference image(s) to this photo. Keep the subject and composition but transform the aesthetic to match the reference.';
    }

    const result = await generateOneBatchImage(photo, fullPrompt, refs);
    if (result) {
      res.json({ image: result });
    } else {
      res.status(500).json({ error: 'Generation failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// VIDEO GENERATION — Veo 2.0 image-to-video via Google GenAI
// ══════════════════════════════════════════════════════════════

const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const videoFields = videoUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

app.post('/api/mockup/video', videoFields, requireActiveSession, async (req: any, res) => {
  try {
    const imageFile = req.files?.['image']?.[0];
    const audioFile = req.files?.['audio']?.[0];

    if (!imageFile) return res.status(400).json({ error: 'No image provided' });

    const hasAudio = !!audioFile;
    console.log(`\n🎬 Video generation starting (Kling)...${hasAudio ? ' (with audio)' : ''}`);

    // Kling API auth
    const jwt = require('jsonwebtoken');
    const klingAccessKey = process.env.KLING_ACCESS_KEY;
    const klingSecretKey = process.env.KLING_SECRET_KEY;
    if (!klingAccessKey || !klingSecretKey) {
      return res.status(500).json({ error: 'KLING_ACCESS_KEY and KLING_SECRET_KEY must be set' });
    }

    const now = Math.floor(Date.now() / 1000);
    const klingToken = jwt.sign(
      { iss: klingAccessKey, exp: now + 1800, nbf: now - 5, iat: now },
      klingSecretKey,
      { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } }
    );

    // Resize image for Kling
    const sharpLib = require('sharp');
    const resized = await sharpLib(imageFile.buffer)
      .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    const imageBase64 = resized.toString('base64');
    const videoPrompt = (req.body?.prompt as string) || 'Subtle cinematic motion. Slow camera movement, atmospheric ambient motion, gentle parallax. Photorealistic, no morphing, no distortion.';

    // Submit image-to-video task to Kling
    const klingSubmit = await fetch('https://api.klingai.com/v1/videos/image2video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${klingToken}`,
      },
      body: JSON.stringify({
        prompt: videoPrompt,
        model_name: 'kling-v3-0',
        duration: '5',
        aspect_ratio: '16:9',
        mode: 'std',
        image: `data:image/jpeg;base64,${imageBase64}`,
      }),
    });

    const klingSubmitData: any = await klingSubmit.json();
    if (klingSubmitData.code !== 0 || !klingSubmitData.data?.task_id) {
      console.error('  ✗ Kling submit failed:', klingSubmitData);
      return res.status(500).json({ error: `Kling submit failed: ${klingSubmitData.message || 'unknown error'}` });
    }

    const taskId = klingSubmitData.data.task_id;
    console.log(`  Task: ${taskId}`);

    // Poll for completion (timeout after 5 minutes)
    const startTime = Date.now();
    const TIMEOUT = 5 * 60 * 1000;
    let taskResult: any = null;

    while (true) {
      if (Date.now() - startTime > TIMEOUT) {
        return res.status(504).json({ error: 'Video generation timed out' });
      }
      await new Promise(r => setTimeout(r, 5000));

      const pollRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
        headers: { 'Authorization': `Bearer ${klingToken}` },
      });
      taskResult = await pollRes.json();
      const status = taskResult.data?.task_status;
      console.log(`  Polling... status: ${status}`);

      if (status === 'succeed') break;
      if (status === 'failed') {
        return res.status(500).json({ error: `Kling generation failed: ${taskResult.data?.task_status_msg || 'unknown'}` });
      }
    }

    const videoUrl = taskResult.data?.task_result?.videos?.[0]?.url;
    if (!videoUrl) {
      return res.status(500).json({ error: 'No video URL in Kling response' });
    }

    console.log(`  ✓ Video ready: ${videoUrl}`);

    // Download the video
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error(`  ✗ Video download failed: ${videoResponse.status} ${videoResponse.statusText}`);
      return res.status(500).json({ error: 'Failed to download video' });
    }
    let videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    // If audio provided, mux with FFmpeg
    if (hasAudio) {
      console.log(`  🎵 Muxing audio (${audioFile.originalname})...`);
      const { execSync } = require('child_process');
      const tmpDir = path.join(__dirname, '../../../data/tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpId = uuid();
      const videoPath = path.join(tmpDir, `${tmpId}-video.mp4`);
      const audioPath = path.join(tmpDir, `${tmpId}-audio${path.extname(audioFile.originalname) || '.mp3'}`);
      const outputPath = path.join(tmpDir, `${tmpId}-final.mp4`);

      fs.writeFileSync(videoPath, videoBuffer);
      fs.writeFileSync(audioPath, audioFile.buffer);

      try {
        // Use audioStart to pick the section of the song
        const audioStart = parseFloat(req.body?.audioStart || '0') || 0;
        // Take 5 seconds of audio starting at audioStart (Kling generates 5s clips), fade out last 1 second
        execSync(
          `ffmpeg -y -i "${videoPath}" -ss ${audioStart} -i "${audioPath}" -t 5 -filter_complex "[1:a]atrim=0:5,asetpts=PTS-STARTPTS,afade=t=out:st=4:d=1[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`,
          { timeout: 30000 }
        );
        videoBuffer = fs.readFileSync(outputPath);
        console.log(`  ✓ Audio muxed: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);
      } catch (ffmpegErr: any) {
        console.warn(`  ⚠ FFmpeg mux failed (returning video without audio):`, ffmpegErr.message?.slice(0, 200));
      } finally {
        // Cleanup temp files
        [videoPath, audioPath, outputPath].forEach(p => { try { fs.unlinkSync(p); } catch {} });
      }
    }

    const videoBase64 = videoBuffer.toString('base64');
    console.log(`  ✓ Video complete: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    res.json({
      base64: videoBase64,
      mimeType: 'video/mp4',
      size: videoBuffer.length,
      durationSeconds: 5,
      hasAudio,
    });
  } catch (e: any) {
    console.error('Video generation failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Stripe Payment Endpoints ──

// POST /api/checkout — create a Stripe Checkout session
app.post('/api/checkout', async (req, res) => {
  try {
    const { tier } = req.body;
    const tierConfig = TIME_PASS_TIERS[tier];
    if (!tierConfig) return res.status(400).json({ error: 'Invalid tier. Use 1h, 4h, or 8h' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `MOXXING ${tierConfig.label}`, description: `${tierConfig.minutes / 60} hour${tierConfig.minutes > 60 ? 's' : ''} of unlimited mockup generation` },
          unit_amount: tierConfig.price,
        },
        quantity: 1,
      }],
      metadata: { tier },
      success_url: `${FRONTEND_URL}/mockup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/mockup`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    console.error('Checkout session creation failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/session/:sessionId — validate a session
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const result = await validateStripeSession(req.params.sessionId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const HOST = process.env.HOST || '127.0.0.1';
app.listen(Number(PORT), HOST, () => {
  console.log(`Cultural Graph API running on 127.0.0.1:${PORT}`);
});
