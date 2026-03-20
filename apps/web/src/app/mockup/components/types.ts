export type Step = 'upload' | 'generating' | 'results' | 'deck';

export interface MockupImage {
  id: string;
  base64: string;
  refIndex: number;
  status: 'keep' | 'rerun' | 'pending';
}

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const MAX_ARTIST_PHOTOS = 10;
export const MAX_REFERENCE_PHOTOS = 30;
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/tiff', 'image/bmp',
];

export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.tiff', '.bmp',
];

export function validateFiles(
  files: File[],
  maxCount: number,
  currentCount: number,
): { valid: File[]; error: string | null } {
  const remaining = maxCount - currentCount;
  if (remaining <= 0) {
    return { valid: [], error: `Maximum ${maxCount} files allowed` };
  }

  const toAdd = files.slice(0, remaining);
  const oversized = toAdd.filter(f => f.size > MAX_FILE_SIZE_BYTES);
  if (oversized.length > 0) {
    const names = oversized.map(f => f.name).join(', ');
    return {
      valid: toAdd.filter(f => f.size <= MAX_FILE_SIZE_BYTES),
      error: `Files over ${MAX_FILE_SIZE_MB}MB skipped: ${names}`,
    };
  }

  const invalid = toAdd.filter(f => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    return !ALLOWED_IMAGE_TYPES.includes(f.type) && !ALLOWED_IMAGE_EXTENSIONS.includes(ext);
  });
  if (invalid.length > 0) {
    return {
      valid: toAdd.filter(f => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return ALLOWED_IMAGE_TYPES.includes(f.type) || ALLOWED_IMAGE_EXTENSIONS.includes(ext);
      }),
      error: `Unsupported file type: ${invalid.map(f => f.name).join(', ')}`,
    };
  }

  return { valid: toAdd, error: null };
}
