import { analyzeImage } from './image-analyzer';
import { YouTubeAnalysis } from './types';

function extractVideoId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // Maybe it's already just an ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  throw new Error(`Could not extract YouTube video ID from: ${url}`);
}

export async function analyzeYouTubeVideo(url: string): Promise<YouTubeAnalysis> {
  const videoId = extractVideoId(url);
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY not set in environment');
  }

  // Fetch video metadata from YouTube Data API v3
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`Video not found: ${videoId}`);
  }

  const video = data.items[0];
  const snippet = video.snippet;
  const contentDetails = video.contentDetails;

  // Get the highest resolution thumbnail available
  const thumbnails = snippet.thumbnails;
  const thumbnailUrl =
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url;

  // Parse ISO 8601 duration (PT1H2M3S) to seconds
  const durationMatch = contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(durationMatch?.[1] || '0');
  const minutes = parseInt(durationMatch?.[2] || '0');
  const seconds = parseInt(durationMatch?.[3] || '0');
  const durationSeconds = hours * 3600 + minutes * 60 + seconds;

  // Analyze the thumbnail image
  console.log(`Analyzing thumbnail for: ${snippet.title}`);
  const thumbnailAnalysis = await analyzeImage(thumbnailUrl);

  return {
    video_id: videoId,
    title: snippet.title,
    channel: snippet.channelTitle,
    description: snippet.description || '',
    thumbnail_url: thumbnailUrl,
    thumbnail_analysis: thumbnailAnalysis,
    duration_seconds: durationSeconds,
    tags: snippet.tags || [],
    category: snippet.categoryId || 'unknown',
  };
}
