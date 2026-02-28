export interface ImageAnalysis {
  color: {
    dominant_colors: { hex: string; weight: number }[];
    temperature: number;
    saturation: number;
    brightness: number;
    harmony_type: string;
  };
  composition: {
    framing: string;
    rule_of_thirds: number;
    symmetry: number;
    depth_of_field: string;
    focal_point: { x: number; y: number };
    negative_space: number;
  };
  lighting: {
    type: string;
    direction: string;
    contrast: number;
    shadow_quality: string;
    color_cast: string;
  };
  texture: {
    medium: string;
    grain: number;
    post_processing: number;
    retouching: number;
    descriptors: string[];
  };
  subject: {
    primary_type: string;
    count: number;
    gaze: string;
    body_language: string;
    skin_tones: string[];
    clothing: string[];
    brands: string[];
    setting: string;
  };
  mood: {
    primary: string;
    secondary: string;
    energy: number;
    intimacy: number;
    tension: number;
    warmth: number;
  };
  cultural: {
    era: string;
    subcultures: string[];
    art_movements: string[];
    recognized_figures: string[];
    geographic_indicators: string[];
  };
  typography: {
    has_text: boolean;
    text_content: string | null;
    font_style: string;
    graphic_elements: string[];
  };
  technical: {
    quality: string;
    aspect_ratio: string;
    is_screenshot: boolean;
    is_collage: boolean;
    estimated_era: string;
  };
}

export interface SpotifyAnalysis {
  track_name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string;
  duration_ms: number;
  bpm: number;
  key: string;
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  loudness: number;
  liveness: number;
  genres: string[];
  related_artists: string[];
}

export interface SpotifyBatchAnalysis {
  tracks: SpotifyAnalysis[];
  aggregate: {
    avg_bpm: number;
    avg_energy: number;
    avg_valence: number;
    bpm_range: [number, number];
    energy_range: [number, number];
    dominant_genres: string[];
    sonic_description: string;
  };
}

export interface YouTubeAnalysis {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail_url: string;
  thumbnail_analysis: ImageAnalysis;
  duration_seconds: number;
  tags: string[];
  category: string;
}

export interface PinterestBoardResult {
  board_url: string;
  pin_count: number;
  images: {
    url: string;
    local_path: string;
    buffer: Buffer;
    description: string | null;
  }[];
  errors: string[];
}

export interface MoodBoardAnalysis {
  images: ImageAnalysis[];
  image_count: number;
  synthesis: {
    manifesto: string;
    narrative: string;
    color_system: {
      primary_palette: { hex: string; weight: number }[];
      accent_colors: { hex: string; weight: number }[];
      temperature: number;
      saturation: number;
      brightness: number;
      color_story: string;
    };
    aesthetic_profile: {
      tags: { tag: string; weight: number }[];
      description: string;
    };
    mood_profile: {
      primary_mood: string;
      secondary_moods: string[];
      energy: number;
      tension: number;
      warmth: number;
      mood_arc: string;
    };
    visual_language: {
      dominant_framing: string[];
      lighting_preference: string[];
      texture_vocabulary: string[];
      medium_preference: string[];
      density: number;
      negative_space: number;
      realism: number;
      post_processing: number;
    };
    subject_analysis: {
      people_ratio: number;
      environment_ratio: number;
      object_ratio: number;
      abstract_ratio: number;
      gaze_patterns: { pattern: string; frequency: number }[];
      body_language_patterns: { pattern: string; frequency: number }[];
      solo_vs_group: number;
      studio_vs_location: number;
    };
    cultural_mapping: {
      era_references: { era: string; frequency: number }[];
      subcultures: { name: string; strength: number }[];
      recognized_figures: string[];
      geographic_signals: { location: string; strength: number }[];
      graph_node_matches: { id: string; label: string; score: number }[];
    };
    contradictions: string[];
    unique_qualities: string[];
  };
  graph_position: {
    nearest_nodes: { id: string; label: string; distance: number }[];
    aesthetic_vector: number[];
    cultural_territory: string;
  };
  touchpoints: {
    photography: string;
    music_video: string;
    short_form_video: string;
    long_form_video: string;
    lyric_visualizer: string;
    live_capture: string;
    album_art: string;
    single_covers: string;
    packaging: string;
    merchandise_tees: string;
    merchandise_hoodies: string;
    merchandise_hats: string;
    merchandise_accessories: string;
    stage_design: string;
    lighting_direction: string;
    tour_visuals: string;
    logo_identity: string;
    typography: string;
    color_system_notes: string;
    tour_flyers: string;
    tour_ads: string;
    styling_artist: string;
    styling_others: string;
    content_direction: string;
    brand_partnerships: string;
    social_content: string;
    [key: string]: string; // allow additional touchpoints
  };
  recommended_talent: {
    photographers: import('@cultural-graph/shared').ScoredNode[];
    directors: import('@cultural-graph/shared').ScoredNode[];
    stylists: import('@cultural-graph/shared').ScoredNode[];
  };
}
