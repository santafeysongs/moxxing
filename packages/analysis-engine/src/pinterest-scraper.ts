import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PinterestBoardResult } from './types';

/**
 * Scrape Pinterest board images using Puppeteer (no external CLI deps).
 * Scrolls the board page to load pins, extracts image URLs, downloads them.
 */
export async function scrapePinterestBoard(
  boardUrl: string,
  options?: {
    maxPins?: number;
    outputDir?: string;
  }
): Promise<PinterestBoardResult> {
  const puppeteer = require('puppeteer');
  const maxPins = options?.maxPins || 200;
  const outputDir = options?.outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'pinterest-'));

  console.log(`Scraping Pinterest board: ${boardUrl}`);
  console.log(`Max pins: ${maxPins}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1440, height: 900 });

    // Navigate to board
    await page.goto(boardUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Pinterest recycles DOM elements while scrolling — images above the viewport get removed.
    // We need to collect URLs on EVERY scroll, not just at the end.
    // Inject a collector into the page that accumulates URLs across scrolls.
    await page.evaluate(() => {
      (window as any).__pinterestUrls = new Set<string>();
    });

    const collectUrls = async () => {
      await page.evaluate(() => {
        // Target only pin images in the board grid — exclude "More like this", sidebar, etc.
        // Board pins live inside [data-test-id="pin"], [data-test-id="boardPin"], or the main grid container
        const selectors = [
          '[data-test-id="pin"] img[src*="pinimg.com"]',
          '[data-test-id="boardPin"] img[src*="pinimg.com"]',
          '[data-test-id="pinWrapper"] img[src*="pinimg.com"]',
          // Fallback: images inside the main content grid (before "More ideas" section)
          '[role="list"] img[src*="pinimg.com"]',
        ];
        let found = false;
        for (const sel of selectors) {
          const imgs = document.querySelectorAll(sel);
          if (imgs.length > 0) {
            found = true;
            imgs.forEach(img => {
              let src = (img as HTMLImageElement).src;
              if (!src || src.includes('75x75') || src.includes('60x60') || src.includes('30x30')) return;
              src = src.replace(/\/\d+x\d*\//, '/originals/');
              src = src.replace(/\/\d+x\//, '/originals/');
              (window as any).__pinterestUrls.add(src);
            });
          }
        }
        // Ultimate fallback if none of the targeted selectors work
        if (!found) {
          const imgs = document.querySelectorAll('img[src*="pinimg.com"]');
          imgs.forEach(img => {
            let src = (img as HTMLImageElement).src;
            if (!src || src.includes('75x75') || src.includes('60x60') || src.includes('30x30')) return;
            src = src.replace(/\/\d+x\d*\//, '/originals/');
            src = src.replace(/\/\d+x\//, '/originals/');
            (window as any).__pinterestUrls.add(src);
          });
        }
      });
      return await page.evaluate(() => (window as any).__pinterestUrls.size) as number;
    };

    let staleScrolls = 0;
    const maxStaleScrolls = 5;
    const maxScrollLoops = 60;
    let previousCollected = 0;

    // Collect initial images
    previousCollected = await collectUrls();

    for (let loops = 0; loops < maxScrollLoops; loops++) {
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));

      const collected = await collectUrls();
      console.log(`  Scroll ${loops + 1}: ${collected} unique images collected`);

      if (collected >= maxPins) break;

      if (collected === previousCollected) {
        staleScrolls++;
        if (staleScrolls >= maxStaleScrolls) break;
        // Try scroll jiggle to trigger lazy loads
        await page.evaluate(() => window.scrollBy(0, -800));
        await new Promise(r => setTimeout(r, 500));
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));
        const afterJiggle = await collectUrls();
        if (afterJiggle > collected) staleScrolls = 0;
      } else {
        staleScrolls = 0;
      }
      previousCollected = collected;
    }

    // Extract collected URLs
    const imageUrls: string[] = await page.evaluate((max: number) => {
      return Array.from((window as any).__pinterestUrls as Set<string>).slice(0, max);
    }, maxPins);

    console.log(`Found ${imageUrls.length} unique images`);

    await browser.close();

    // Download images
    const images: PinterestBoardResult['images'] = [];
    const errors: string[] = [];

    // Download images in batches of 20
    let downloadIdx = 0;
    for (let i = 0; i < imageUrls.length; i += 20) {
      const batch = imageUrls.slice(i, i + 20);
      await Promise.all(batch.map(async (url) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);

          const idx = downloadIdx++;
          const ext = url.includes('.png') ? 'png' : 'jpg';
          const filePath = path.join(outputDir, `pin_${String(idx).padStart(3, '0')}.${ext}`);
          fs.writeFileSync(filePath, buffer);

          images.push({ url, local_path: filePath, buffer, description: null });
        } catch (e: any) {
          errors.push(`Failed to download ${url}: ${e.message}`);
        }
      }));
      if (images.length > 0 && i > 0) {
        console.log(`  Downloaded ${images.length}/${imageUrls.length} images...`);
      }
    }

    console.log(`Downloaded ${images.length} images (${errors.length} errors)`);

    return {
      board_url: boardUrl,
      pin_count: images.length,
      images,
      errors,
    };
  } catch (error: any) {
    await browser.close();
    throw error;
  }
}

export function cleanupPinterestFiles(result: PinterestBoardResult): void {
  if (!result.images.length) return;
  const dir = path.dirname(result.images[0]?.local_path || '');
  if (dir && dir.includes('pinterest-')) {
    try {
      fs.rmSync(dir, { recursive: true });
      console.log('Cleaned up temporary Pinterest files');
    } catch {}
  }
}
