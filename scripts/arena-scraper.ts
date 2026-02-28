/**
 * Are.na Scraper — Pull curated aesthetic channels into the intelligence engine.
 * 
 * Public API, no auth needed for public channels.
 * Rate limit: 100 req/min (we'll be conservative at 60/min).
 * 
 * Usage: npx ts-node scripts/arena-scraper.ts [--search "query"] [--max-channels 50] [--min-blocks 10]
 */

import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'https://api.are.na/v2';
const ARENA_TOKEN = process.env.ARENA_ACCESS_TOKEN || '';
const RATE_LIMIT_MS = 1100; // ~55 req/min to stay safe
const DATA_DIR = path.join(__dirname, '..', 'data', 'arena');

// Search terms relevant to creative direction
const SEARCH_TERMS = [
  'art direction',
  'creative direction', 
  'mood board',
  'visual identity',
  'branding',
  'editorial design',
  'fashion photography',
  'music visual',
  'album art',
  'color palette',
  'typography',
  'brutalist design',
  'film photography',
  'concert visual',
  'stage design',
  'styling reference',
  'graphic design',
  'poster design',
  'zine',
  'streetwear',
  'aesthetic',
  'visual culture',
  'photography direction',
  'music video reference',
  'record packaging',
  'merchandise design',
];

interface ArenaBlock {
  id: number;
  title: string | null;
  description: string | null;
  content: string | null;
  source: { url: string } | null;
  image: {
    filename: string;
    content_type: string;
    updated_at: string;
    thumb: { url: string };
    square: { url: string };
    display: { url: string };
    large: { url: string };
    original: { url: string };
  } | null;
  class: string; // 'Image', 'Text', 'Link', 'Media', 'Attachment', 'Channel'
  created_at: string;
  connected_at: string;
  connection_id: number;
}

interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  length: number;
  status: string;
  follower_count: number;
  user: {
    slug: string;
    username: string;
    first_name: string;
    last_name: string;
  };
  metadata: { description: string };
  created_at: string;
  updated_at: string;
}

interface ScrapedChannel {
  id: number;
  title: string;
  slug: string;
  description: string;
  block_count: number;
  follower_count: number;
  creator: string;
  creator_slug: string;
  created_at: string;
  updated_at: string;
  search_term: string;
  images: {
    block_id: number;
    title: string | null;
    description: string | null;
    image_url: string;
    thumb_url: string;
    source_url: string | null;
    created_at: string;
  }[];
  text_blocks: {
    block_id: number;
    title: string | null;
    content: string;
  }[];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function arenaFetch(endpoint: string, params?: Record<string, string>, retries: number = 3): Promise<any> {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ARENA_TOKEN) {
    headers['Authorization'] = `Bearer ${ARENA_TOKEN}`;
  }
  const res = await fetch(url.toString(), { headers });
  
  if (!res.ok) {
    if (res.status === 429) {
      console.log('  Rate limited, waiting 30s...');
      await sleep(30000);
      return arenaFetch(endpoint, params, retries);
    }
    if ((res.status === 504 || res.status === 502 || res.status === 503) && retries > 0) {
      console.log(`  ${res.status} error, retrying in 10s... (${retries} retries left)`);
      await sleep(10000);
      return arenaFetch(endpoint, params, retries - 1);
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Arena API ${res.status}`);
  }
  
  return res.json();
}

async function searchChannels(query: string, maxPages: number = 5, minBlocks: number = 10): Promise<ArenaChannel[]> {
  const channels: ArenaChannel[] = [];
  
  for (let page = 1; page <= maxPages; page++) {
    const data = await arenaFetch('/search/channels', {
      q: query,
      per: '40',
      page: String(page),
    });
    
    if (!data.channels || data.channels.length === 0) break;
    
    // Filter: public/closed, right size range, not a profile channel
    const filtered = data.channels.filter((c: ArenaChannel) =>
      c.length >= minBlocks &&
      c.length <= 150 && // Are.na 504s on big channels — keep it small
      c.status !== 'private' &&
      c.kind !== 'profile'
    );
    
    channels.push(...filtered);
    
    if (page >= data.total_pages) break;
    await sleep(RATE_LIMIT_MS);
  }
  
  return channels;
}

async function getChannelContents(slug: string, maxBlocks: number = 300): Promise<ArenaBlock[]> {
  const blocks: ArenaBlock[] = [];
  const perPage = 50; // smaller pages = less server strain
  const maxPages = Math.ceil(maxBlocks / perPage);
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await arenaFetch(`/channels/${slug}/contents`, {
        per: String(perPage),
        page: String(page),
      });
      
      if (!data.contents || data.contents.length === 0) break;
      blocks.push(...data.contents);
      
      if (blocks.length >= maxBlocks) break;
      if (page >= (data.total_pages || 999)) break;
      await sleep(RATE_LIMIT_MS);
    } catch (e: any) {
      console.log(`      ⚠ Page ${page} failed, using ${blocks.length} blocks so far`);
      break;
    }
  }
  
  return blocks;
}

async function scrapeChannel(channel: ArenaChannel, searchTerm: string): Promise<ScrapedChannel> {
  const blocks = await getChannelContents(channel.slug);
  
  const images = blocks
    .filter(b => b.class === 'Image' && b.image)
    .map(b => ({
      block_id: b.id,
      title: b.title,
      description: b.description,
      image_url: b.image!.original?.url || b.image!.large?.url || b.image!.display?.url,
      thumb_url: b.image!.thumb?.url || b.image!.square?.url,
      source_url: b.source?.url || null,
      created_at: b.created_at,
    }));
  
  const text_blocks = blocks
    .filter(b => b.class === 'Text' && b.content)
    .map(b => ({
      block_id: b.id,
      title: b.title,
      content: b.content!,
    }));
  
  return {
    id: channel.id,
    title: channel.title,
    slug: channel.slug,
    description: channel.metadata?.description || '',
    block_count: channel.length,
    follower_count: channel.follower_count,
    creator: channel.user?.username || `${channel.user?.first_name} ${channel.user?.last_name}`,
    creator_slug: channel.user?.slug || '',
    created_at: channel.created_at,
    updated_at: channel.updated_at,
    search_term: searchTerm,
    images,
    text_blocks,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const searchOnly = args.includes('--search') ? args[args.indexOf('--search') + 1] : null;
  const maxChannelsArg = args.includes('--max-channels') ? parseInt(args[args.indexOf('--max-channels') + 1]) : 50;
  const minBlocks = args.includes('--min-blocks') ? parseInt(args[args.indexOf('--min-blocks') + 1]) : 10;
  
  // Ensure data directory
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'channels'), { recursive: true });
  
  const terms = searchOnly ? [searchOnly] : SEARCH_TERMS;
  const seenSlugs = new Set<string>();
  let totalChannels = 0;
  let totalImages = 0;
  
  // Load existing to avoid re-scraping
  const existingFiles = fs.readdirSync(path.join(DATA_DIR, 'channels')).filter(f => f.endsWith('.json'));
  for (const f of existingFiles) {
    seenSlugs.add(f.replace('.json', ''));
  }
  if (seenSlugs.size > 0) {
    console.log(`Found ${seenSlugs.size} already-scraped channels, will skip them.`);
  }
  
  console.log(`\n🔍 Scraping Are.na channels`);
  console.log(`   Search terms: ${terms.length}`);
  console.log(`   Max channels per term: ${maxChannelsArg}`);
  console.log(`   Min blocks per channel: ${minBlocks}\n`);
  
  for (const term of terms) {
    console.log(`\n── Searching: "${term}" ──`);
    
    try {
      const channels = await searchChannels(term, 3, minBlocks);
      console.log(`   Found ${channels.length} channels with ≥${minBlocks} blocks`);
      
      // Sort by follower count (quality signal)
      channels.sort((a, b) => b.follower_count - a.follower_count);
      
      const toScrape = channels.slice(0, maxChannelsArg);
      
      for (const channel of toScrape) {
        if (seenSlugs.has(channel.slug)) {
          continue;
        }
        seenSlugs.add(channel.slug);
        
        try {
          console.log(`   📦 ${channel.title} (${channel.length} blocks, ${channel.follower_count} followers)`);
          const scraped = await scrapeChannel(channel, term);
          
          // Save to disk
          const filePath = path.join(DATA_DIR, 'channels', `${channel.slug}.json`);
          fs.writeFileSync(filePath, JSON.stringify(scraped, null, 2));
          
          totalChannels++;
          totalImages += scraped.images.length;
          console.log(`      → ${scraped.images.length} images, ${scraped.text_blocks.length} text blocks`);
          
          await sleep(RATE_LIMIT_MS);
        } catch (e: any) {
          console.warn(`      ✗ Failed: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.warn(`   ✗ Search failed: ${e.message}`);
    }
  }
  
  // Write summary
  const summary = {
    scraped_at: new Date().toISOString(),
    total_channels: totalChannels,
    total_images: totalImages,
    search_terms: terms,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'scrape-summary.json'), JSON.stringify(summary, null, 2));
  
  console.log(`\n✅ Done!`);
  console.log(`   Channels scraped: ${totalChannels}`);
  console.log(`   Total images found: ${totalImages}`);
  console.log(`   Data saved to: ${DATA_DIR}/channels/`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
