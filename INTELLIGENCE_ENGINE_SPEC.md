# Culture & Context: Creative Intelligence Engine
## Technical Scraping & Data Architecture Plan

---

## The Thesis

Culture & Context is two products built on one engine:

1. **The Deck Tool** (revenue product) — upload references, get a creative direction deck. This is what users pay for and what we demo. Ships first.
2. **The Intelligence Engine** (strategic asset) — a structured database of aesthetic patterns, creative reference clusters, and direction frameworks scraped from the world's creative output. This is what makes the deck tool better than any competitor and what makes the company worth acquiring.

Every deck generated feeds the engine. The engine makes every deck smarter. The scraping seeds the engine before we have users.

---

## Data Sources

### Source 1: Behance (PRIMARY)
- 24M+ members, projects include high-res images, descriptions, tags, creative fields, engagement
- Target: 200K-500K projects in Art Direction, Branding, Photography, Fashion
- Apify scrapers or custom Puppeteer with stealth
- Est. cost: $50-200 compute, ~1TB storage

### Source 2: Are.na (PRIMARY)
- Creative professional mood board tool — human-curated aesthetic clusters
- Public REST API: `https://api.are.na/v2/`
- 100 req/min, free, open-source friendly
- Target: 30K-50K channels
- Cross-channel block connections = graph of aesthetic relationships

### Source 3: Pinterest (Public Boards)
- 500M+ users, massive volume, lower quality signal
- Focus on professional accounts (designer/CD/AD in bio)
- Target: 100K boards
- Priority: MEDIUM (Month 2-3)

### Source 4: Award Show Archives
- Cannes Lions, D&AD, One Show, Clios
- Campaign case studies with briefs, strategy, execution
- Target: 15K-30K campaigns
- WARC subscription optional ($5K-10K/year)

### Source 5: Agency Portfolios
- W+K, Droga5, AKQA, COLLINS, Pentagram, etc.
- Highest quality per-unit, most labor intensive
- Target: 3K-5K case studies across 50-100 agencies

### Source 6: Music-Specific Visual Archives
- Discogs API (free, 16M+ releases with cover art)
- IMVDb (music video credits/directors)
- Target: 100K-300K releases

---

## Processing Pipeline

### Step 1: Raw Scrape → Structured Storage
- S3 for raw images, Postgres for structured metadata

### Step 2: Vision Analysis → Aesthetic Attributes
- Pass 1 (cheap): CLIP embeddings for every image (similarity search, clustering)
- Pass 2 (selective): Claude Vision on top 20% — extract colors, mood, lighting, texture, composition, era references, cultural codes, photography style, fashion references
- 100K images × $0.02 = ~$2,000

### Step 3: Clustering → Aesthetic Territories
- UMAP dimensionality reduction + HDBSCAN clustering
- Claude names/describes each cluster
- Output: named territories like "Neo-Brutalist Warmth" with attributes and examples

### Step 4: Graph Construction → Neo4j
- Nodes: AestheticTerritory, Project, Creator, CulturalReference, ColorPalette, Attribute
- Edges: PROJECT_IN_TERRITORY, TERRITORY_ADJACENT, CREATOR_WORKS_IN, REFERENCES, SIMILAR_PALETTE, CO_OCCURS_WITH

---

## Integration with Deck Tool

**Enhanced flow:**
```
User uploads references → CLIP embedding → Nearest aesthetic territories identified
→ Similar projects and directions retrieved → Context injected into synthesis prompt
→ Claude synthesizes (informed by real-world patterns) → Generates deck
```

The engine is invisible. The output quality is the product.

---

## Data Feedback Loop

Every campaign creates new data:
- Images get CLIP embeddings
- Aesthetic attributes extracted
- Input→output pairs stored
- User edits tracked (quality signal)

After 10K campaigns: recommendations based on real creative director behavior.
This is the moat.

---

## Cost Estimates

| Component | Monthly |
|-----------|---------|
| S3 (~2TB) | $46 |
| Postgres + pgvector | $15 |
| Neo4j | $65 |
| Ongoing processing | ~$910 |
| **Total** | **~$1,036/month** |

One-time scraping + processing: ~$2,300

---

## Build Order

Weeks 1-2: S3 + Postgres + Are.na scraper + Behance scraper + CLIP pipeline
Weeks 3-4: CLIP embeddings + Claude Vision Pass 2 + attribute storage
Weeks 5-6: UMAP/HDBSCAN clustering + territory naming + Neo4j graph
Weeks 7-8: Context retrieval → synthesis prompt integration + A/B test
Weeks 9-12: Browse/search UI, Are.na import, Pinterest import, Canva App

---

## Acquisition Play

1. Product with paying users
2. Proprietary dataset (500K+ projects, aesthetic territories)
3. Growing moat (every campaign adds data)
4. Plug-in architecture (Canva App ready, API available)
5. Domain expertise encoded in prompt architecture
