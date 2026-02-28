/**
 * Behance Scraper — Pull creative projects using Puppeteer.
 * 
 * Scrapes Behance search results for art direction, branding, photography projects.
 * Extracts: images, descriptions, tags, creative fields, engagement metrics.
 * 
 * Usage: npx tsx scripts/behance-scraper.ts [--search "query"] [--max-projects 50]
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data', 'behance');

const SEARCH_TERMS = [
  'art direction music',
  'album art direction',
  'music branding',
  'creative direction artist',
  'visual identity musician',
  'music video art direction',
  'concert visual design',
  'tour creative direction',
  'record packaging design',
  'music photography editorial',
  'fashion photography editorial',
  'branding identity design',
  'poster design music',
  'merchandise design',
  'stage design concert',
];

interface BehanceProject {
  id: string;
  title: string;
  url: string;
  creator: string;
  creator_url: string;
  fields: string[];
  tags: string[];
  description: string;
  images: string[];
  appreciations: number;
  views: number;
  published: string;
  search_term: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeSearchResults(
  browser: any,
  query: string,
  maxProjects: number
): Promise<{ url: string; title: string }[]> {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1440, height: 900 });

  const searchUrl = `https://www.behance.net/search/projects?search=${encodeURIComponent(query)}&field=art+direction`;
  console.log(`  Loading: ${searchUrl}`);

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Scroll to load more projects
    let previousCount = 0;
    for (let scroll = 0; scroll < 5; scroll++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000);

      const count = await page.evaluate(() =>
        document.querySelectorAll('a[href*="/gallery/"]').length
      );
      if (count >= maxProjects || count === previousCount) break;
      previousCount = count;
    }

    // Extract project links
    const projects = await page.evaluate((max: number) => {
      const links = document.querySelectorAll('a[href*="/gallery/"]');
      const results: { url: string; title: string }[] = [];
      const seen = new Set<string>();

      links.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        if (seen.has(href) || !href.includes('/gallery/')) return;
        seen.add(href);
        const title = (link as HTMLElement).textContent?.trim() || '';
        if (title && title.length > 2) {
          results.push({ url: href, title });
        }
      });

      return results.slice(0, max);
    }, maxProjects);

    await page.close();
    return projects;
  } catch (e: any) {
    console.warn(`    Search failed: ${e.message}`);
    await page.close();
    return [];
  }
}

async function scrapeProject(browser: any, projectUrl: string, searchTerm: string): Promise<BehanceProject | null> {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(projectUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1500);

    // Scroll to load lazy images
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(500);
    }

    const data = await page.evaluate(() => {
      // Title
      const title = document.querySelector('h1')?.textContent?.trim() || '';

      // Creator
      const creatorEl = document.querySelector('a[href*="/"][class*="owner"], a.UserInfo-userName');
      const creator = creatorEl?.textContent?.trim() || '';
      const creator_url = (creatorEl as HTMLAnchorElement)?.href || '';

      // Description
      const descEl = document.querySelector('[class*="ProjectDescription"], .project-description, .e2e-project-description');
      const description = descEl?.textContent?.trim() || '';

      // Tags
      const tagEls = document.querySelectorAll('a[href*="/search?"][class*="tag"], a[href*="tags"]');
      const tags = Array.from(tagEls).map(t => t.textContent?.trim()).filter(Boolean) as string[];

      // Creative fields
      const fieldEls = document.querySelectorAll('a[href*="/search/projects?field="], span[class*="field"]');
      const fields = Array.from(fieldEls).map(f => f.textContent?.trim()).filter(Boolean) as string[];

      // Images — get all project images
      const imgEls = document.querySelectorAll('img[src*="behance.net"], img[src*="adobeprojects"], img[srcset]');
      const images: string[] = [];
      const seenUrls = new Set<string>();
      imgEls.forEach(img => {
        const src = (img as HTMLImageElement).src;
        // Filter out tiny avatars and icons
        if (src && !seenUrls.has(src) && !src.includes('50x50') && !src.includes('100x100') && !src.includes('avatar')) {
          seenUrls.add(src);
          images.push(src);
        }
      });

      // Engagement
      const statsText = document.body.innerText;
      const appreciations = parseInt(statsText.match(/(\d[\d,]*)\s*(?:appreciations?|likes?)/i)?.[1]?.replace(/,/g, '') || '0');
      const views = parseInt(statsText.match(/(\d[\d,]*)\s*views?/i)?.[1]?.replace(/,/g, '') || '0');

      // Published date
      const timeEl = document.querySelector('time');
      const published = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || '';

      return { title, creator, creator_url, description, tags, fields, images, appreciations, views, published };
    });

    await page.close();

    // Extract project ID from URL
    const idMatch = projectUrl.match(/\/gallery\/(\d+)/);
    const id = idMatch ? idMatch[1] : projectUrl.split('/').pop() || '';

    return {
      id,
      url: projectUrl,
      search_term: searchTerm,
      ...data,
    };
  } catch (e: any) {
    console.warn(`    Project failed: ${e.message}`);
    await page.close();
    return null;
  }
}

async function main() {
  const puppeteer = require('puppeteer');

  const args = process.argv.slice(2);
  const searchOnly = args.includes('--search') ? args[args.indexOf('--search') + 1] : null;
  const maxProjects = args.includes('--max-projects') ? parseInt(args[args.indexOf('--max-projects') + 1]) : 20;

  fs.mkdirSync(path.join(DATA_DIR, 'projects'), { recursive: true });

  const terms = searchOnly ? [searchOnly] : SEARCH_TERMS;

  // Load existing to skip
  const existingFiles = new Set(
    fs.readdirSync(path.join(DATA_DIR, 'projects')).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  );
  if (existingFiles.size > 0) {
    console.log(`Found ${existingFiles.size} already-scraped projects, will skip them.`);
  }

  console.log(`\n🎨 Scraping Behance projects`);
  console.log(`   Search terms: ${terms.length}`);
  console.log(`   Max projects per term: ${maxProjects}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let totalProjects = 0;
  let totalImages = 0;

  for (const term of terms) {
    console.log(`\n── Searching: "${term}" ──`);

    const results = await scrapeSearchResults(browser, term, maxProjects);
    console.log(`   Found ${results.length} projects`);

    for (const result of results) {
      const idMatch = result.url.match(/\/gallery\/(\d+)/);
      const id = idMatch ? idMatch[1] : '';
      if (!id || existingFiles.has(id)) continue;
      existingFiles.add(id);

      console.log(`   📦 ${result.title.slice(0, 60)}`);
      const project = await scrapeProject(browser, result.url, term);

      if (project && project.images.length > 0) {
        const filePath = path.join(DATA_DIR, 'projects', `${project.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
        totalProjects++;
        totalImages += project.images.length;
        console.log(`      → ${project.images.length} images, ${project.tags.length} tags`);
      } else {
        console.log(`      → skipped (no images)`);
      }

      await sleep(2000 + Math.random() * 2000); // polite delay
    }
  }

  await browser.close();

  const summary = {
    scraped_at: new Date().toISOString(),
    total_projects: totalProjects,
    total_images: totalImages,
    search_terms: terms,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'scrape-summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Projects scraped: ${totalProjects}`);
  console.log(`   Total images found: ${totalImages}`);
  console.log(`   Data saved to: ${DATA_DIR}/projects/`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
