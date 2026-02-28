# Recognition Engine — Build Plan

## Phase 1: Recognition Engine (replaces current image-analyzer.ts)
**New file:** `packages/analysis-engine/src/recognition-engine.ts`

What it does: Takes each uploaded image → Claude Vision call with the full 14-category taxonomy as system prompt → returns an array of specific cultural nodes per image.

Each node is:
```ts
interface CulturalNode {
  id: string;                    // slugified unique id
  name: string;                  // "Juergen Teller, Marc Jacobs era (2001)"
  category: number;              // 1-14
  categoryName: string;          // "People", "Equipment & Technical Culture"
  specificity: string;           // the lineage/context sentence
  imageIndex: number;            // which uploaded image it came from
  confidence: number;            // 0-1
}
```

Cost: ~$0.05 per image (Claude Vision). 20 images = ~$1.00.

## Phase 2: Cross-Reference Analysis
**New file:** `packages/analysis-engine/src/cross-reference.ts`

Takes all nodes from all images → finds:
- **Commonalities**: nodes appearing across 2+ images
- **Anomalies**: nodes appearing once but high confidence
- **Clusters**: nodes from different categories that point to the same cultural pocket

Output: flat list of all unique nodes with frequency count + anomaly flag.

This is pure logic — no API calls. Fast.

## Phase 3: Curation UI (new step in create page)
**Modified:** `apps/web/src/app/create/page.tsx`

New step between "upload references" and "generate":
- Shows all recognized nodes as clickable chips
- User selects up to 20
- Text input for "what's missing"
- User-typed entries become nodes with equal weight
- Also: select 10 featured images from the reference pool (existing feature)

## Phase 4: Thread-Pull
**New file:** `packages/analysis-engine/src/thread-pull.ts`

Takes 20 selected nodes → for each node, one Claude call asking:
"Follow this cultural signal outward. Return: People, Brands, Materials, Locations, Product Formats, Visual Language."

Then: overlap analysis across all 20 thread results.

Cost: ~$0.03 per thread × 20 = ~$0.60.

## Phase 5: Wire Into Existing Pipeline

The thread-pull output replaces the current synthesis as the foundation for:
- Deck text (manifesto, creative direction sections)
- Product design (Tier 1 baseline + Tier 2 discovery from thread overlaps)
- Image generation prompts (still reference-image-driven, but thread-pull informs the text portion)

## Build Order
1. Recognition engine (can test standalone)
2. Cross-reference analysis (pure logic)
3. Curation UI (new create page step)
4. Thread-pull + overlap
5. Wire into pipeline

Each phase is independently testable. The existing flow keeps working until Phase 5 swaps it in.
