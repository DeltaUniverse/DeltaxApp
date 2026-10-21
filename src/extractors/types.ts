export type MediaType = 'video' | 'photo';

export interface ExtractedMediaItem {
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface ExtractedStats {
  likes?: number;
  comments?: number;
  views?: number;
  shares?: number;
}

export interface ExtractedResult {
  platform: 'instagram' | 'tiktok' | 'twitter';
  id: string;
  caption?: string;
  author?: {
    name?: string;
    username?: string;
  };
  stats?: ExtractedStats;
  items: ExtractedMediaItem[];
}
