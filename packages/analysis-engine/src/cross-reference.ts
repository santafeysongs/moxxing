/**
 * Cross-Reference Analysis — Stage 2 of the CONTEXX architecture
 * 
 * Takes all cultural nodes from bulk recognition and identifies:
 * - Commonalities: nodes appearing across multiple images
 * - Anomalies: nodes appearing once but with high cultural weight
 * - Clusters: nodes from different categories pointing to the same cultural pocket
 * 
 * No API calls. Pure logic. Fast.
 */

import { CulturalNode, BulkRecognitionResult } from './recognition-engine';

// ── TYPES ──

export interface CrossReferencedNode {
  /** Representative node (highest confidence instance) */
  node: CulturalNode;
  /** How many different images this node appeared in */
  frequency: number;
  /** Which image indices it appeared in */
  imageIndices: number[];
  /** Is this a commonality (2+ images) or anomaly (1 image, high weight)? */
  type: 'commonality' | 'anomaly' | 'singular';
  /** Combined score: frequency × confidence */
  weight: number;
  /** All instances of this node across images (may have slightly different names) */
  instances: CulturalNode[];
}

export interface CrossReferenceResult {
  /** All unique nodes, sorted by weight */
  nodes: CrossReferencedNode[];
  /** Just the commonalities */
  commonalities: CrossReferencedNode[];
  /** Just the anomalies (single occurrence, high confidence) */
  anomalies: CrossReferencedNode[];
  /** Category distribution */
  categoryBreakdown: Record<string, number>;
  /** Total unique cultural signals identified */
  totalUnique: number;
}

// ── MAIN ANALYSIS ──

export function crossReference(recognition: BulkRecognitionResult): CrossReferenceResult {
  const allNodes = recognition.allNodes;

  // Group similar nodes by fuzzy matching on name + category
  const groups = groupSimilarNodes(allNodes);

  // Build cross-referenced nodes
  const crNodes: CrossReferencedNode[] = groups.map(group => {
    const bestNode = group.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const imageIndices = [...new Set(group.map(n => n.imageIndex))];
    const frequency = imageIndices.length;
    const avgConfidence = group.reduce((sum, n) => sum + n.confidence, 0) / group.length;

    let type: 'commonality' | 'anomaly' | 'singular';
    if (frequency >= 2) {
      type = 'commonality';
    } else if (avgConfidence >= 0.75) {
      type = 'anomaly';
    } else {
      type = 'singular';
    }

    return {
      node: bestNode,
      frequency,
      imageIndices,
      type,
      weight: frequency * avgConfidence,
      instances: group,
    };
  });

  // Sort by weight (commonalities naturally rank higher)
  crNodes.sort((a, b) => b.weight - a.weight);

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  for (const crn of crNodes) {
    const cat = crn.node.categoryName;
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
  }

  return {
    nodes: crNodes,
    commonalities: crNodes.filter(n => n.type === 'commonality'),
    anomalies: crNodes.filter(n => n.type === 'anomaly'),
    categoryBreakdown,
    totalUnique: crNodes.length,
  };
}

// ── FUZZY GROUPING ──

function groupSimilarNodes(nodes: CulturalNode[]): CulturalNode[][] {
  const groups: CulturalNode[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < nodes.length; i++) {
    if (assigned.has(i)) continue;

    const group = [nodes[i]];
    assigned.add(i);

    for (let j = i + 1; j < nodes.length; j++) {
      if (assigned.has(j)) continue;

      if (isSimilarNode(nodes[i], nodes[j])) {
        group.push(nodes[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

function isSimilarNode(a: CulturalNode, b: CulturalNode): boolean {
  // Must be same category
  if (a.category !== b.category) return false;

  // Normalize names for comparison
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);

  // Exact match after normalization
  if (nameA === nameB) return true;

  // One contains the other (handles "Juergen Teller" matching "Juergen Teller, Marc Jacobs era")
  if (nameA.includes(nameB) || nameB.includes(nameA)) return true;

  // Token overlap — if 60%+ of words match
  const tokensA = new Set(nameA.split(/\s+/));
  const tokensB = new Set(nameB.split(/\s+/));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const minSize = Math.min(tokensA.size, tokensB.size);
  if (minSize >= 2 && intersection / minSize >= 0.6) return true;

  return false;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
