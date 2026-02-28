export type NodeLabel =
  | 'Artist' | 'Photographer' | 'Director' | 'Stylist'
  | 'Designer' | 'Brand' | 'City' | 'Scene'
  | 'Aesthetic' | 'Genre' | 'Project' | 'Technique';

export type RelationType =
  | 'COLLABORATED_WITH' | 'SHOT_BY' | 'DIRECTED_BY'
  | 'STYLED_BY' | 'BRAND_AFFILIATION' | 'AESTHETIC_AFFINITY'
  | 'GEOGRAPHIC_ANCHOR' | 'PART_OF_SCENE' | 'GENRE_AFFINITY'
  | 'USES_TECHNIQUE' | 'COLOR_SIMILARITY' | 'SONIC_PROXIMITY'
  | 'CULTURAL_BRIDGE';

export interface NodeProperties {
  id: string;
  name: string;
  color_palette?: string[];
  color_weights?: number[];
  color_temperature?: number;
  color_saturation?: number;
  aesthetic_tags?: string[];
  aesthetic_weights?: number[];
  mood_tags?: string[];
  mood_weights?: number[];
  energy?: number;
  description?: string;
  [key: string]: any;
}

export interface ScoredNode {
  node: NodeProperties;
  label: NodeLabel;
  score: number;
}

export interface CreativeDirection {
  manifesto: string;
  color_palette: string[];
  aesthetic_tags: { tag: string; weight: number }[];
  mood_tags: { tag: string; weight: number }[];
  energy: number;
  referenced_nodes: { id: string; label: NodeLabel; weight: number }[];
}
