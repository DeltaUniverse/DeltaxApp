import type { ExtractedResult, ExtractedMediaItem } from './types';

export const TIKTOK_VM_REGEX =
  /https?:\/\/(?:(?:vm|vt|www)\.)?(?:vx)?tiktok\.com\/(?:t\/)?(?<id>[a-zA-Z0-9_-]+)/i;

export const TIKTOK_URL_REGEX =
  /https?:\/\/(?:(?:www|m)\.)?(?:vx)?tiktok\.com\/(?:(?:embed|@[\w.-]*)\/)?(?:v(?:ideo)?|p(?:hoto)?)\/(?<id>\d+)/i;

const TIKTOK_UNIVERSAL_REGEX =
  /<script[^>]+\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/;

/**
 * Resolve vm.tiktok.com / vt.tiktok.com short URLs
 */
export async function resolveTikTokShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/**
 * Method 1: TikWM Guest API (GET + POST fallback, with hd=1).
 * From DeltaBox/PagerApi.
 */
async function extractViaTikWM(url: string): Promise<ExtractedResult | null> {
  const endpoints = ['https://www.tikwm.com/api/', 'https://tikwm.com/api/'];

  for (const endpoint of endpoints) {
    // 1. Try GET with hd=1
    try {
      const getUrl = `${endpoint}?url=${encodeURIComponent(url)}&hd=1`;
      const res = await fetch(getUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          accept: 'application/json, text/plain, */*',
        },
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        if (json?.code === 0 && json.data) {
          return parseTikWMData(json.data);
        }
      }
    } catch {
      // Try next
    }

    // 2. Try POST with hd=1
    try {
      const postRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: `url=${encodeURIComponent(url)}&hd=1`,
      });

      if (postRes.ok) {
        const json = (await postRes.json()) as any;
        if (json?.code === 0 && json.data) {
          return parseTikWMData(json.data);
        }
      }
    } catch {
      // Try next
    }
  }

  return null;
}

function parseTikWMData(data: any): ExtractedResult | null {
  const items: ExtractedMediaItem[] = [];

  if (Array.isArray(data.images) && data.images.length > 0) {
    // Photo slide mode
    for (const imgUrl of data.images) {
      items.push({
        type: 'photo',
        url: imgUrl,
      });
    }
  } else if (data.hdplay || data.play || data.wmplay) {
    // Video mode: Prefer HD watermark-free
    const rawPlay = data.hdplay || data.play || data.wmplay;
    const videoUrl = rawPlay.startsWith('http')
      ? rawPlay
      : `https://www.tikwm.com${rawPlay}`;

    items.push({
      type: 'video',
      url: videoUrl,
      thumbnailUrl: data.cover,
      width: data.width,
      height: data.height,
    });
  }

  if (items.length === 0) return null;

  return {
    platform: 'tiktok',
    id: String(data.id || ''),
    caption: data.title || '',
    author: {
      name: data.author?.nickname,
      username: data.author?.unique_id,
    },
    stats: {
      likes: typeof data.digg_count === 'number' ? data.digg_count : undefined,
      comments: typeof data.comment_count === 'number' ? data.comment_count : undefined,
      views: typeof data.play_count === 'number' ? data.play_count : undefined,
      shares: typeof data.share_count === 'number' ? data.share_count : undefined,
    },
    items,
  };
}

/**
 * Method 2: Extract TikTok media via Web Rehydration Scraping
 */
async function extractViaWebRehydration(id: string): Promise<ExtractedResult | null> {
  try {
    const videoUrl = `https://www.tiktok.com/@_/video/${id}`;
    const res = await fetch(videoUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const match = html.match(TIKTOK_UNIVERSAL_REGEX);
    if (!match?.[1]) return null;

    const data = JSON.parse(match[1]);
    const itemInfo =
      data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!itemInfo) return null;

    const items: ExtractedMediaItem[] = [];

    // Image post / Photo mode
    if (
      Array.isArray(itemInfo.imagePost?.images) &&
      itemInfo.imagePost.images.length > 0
    ) {
      for (const img of itemInfo.imagePost.images) {
        const imgUrl = img.imageURL?.urlList?.[0] || img.displayImage?.urlList?.[0];
        if (imgUrl) {
          items.push({
            type: 'photo',
            url: imgUrl,
          });
        }
      }
    } else if (itemInfo.video?.playAddr) {
      // Standard video
      items.push({
        type: 'video',
        url: itemInfo.video.playAddr,
        thumbnailUrl: itemInfo.video.cover,
        width: itemInfo.video.width,
        height: itemInfo.video.height,
      });
    }

    if (items.length === 0) return null;

    return {
      platform: 'tiktok',
      id: String(itemInfo.id || id),
      caption: itemInfo.desc || '',
      author: {
        name: itemInfo.author?.nickname,
        username: itemInfo.author?.uniqueId,
      },
      items,
    };
  } catch {
    return null;
  }
}

/**
 * Extract TikTok media: TikWM API -> Web Rehydration Scraping
 */
export async function extractTikTok(inputUrl: string): Promise<ExtractedResult | null> {
  let url = inputUrl;

  if (TIKTOK_VM_REGEX.test(url)) {
    url = await resolveTikTokShortUrl(url);
  }

  // 1. TikWM API (GET & POST)
  const tikwmResult = await extractViaTikWM(url);
  if (tikwmResult && tikwmResult.items.length > 0) {
    return tikwmResult;
  }

  // 2. Web Rehydration Scraper
  const match = url.match(TIKTOK_URL_REGEX);
  if (match?.groups?.id) {
    const rehydResult = await extractViaWebRehydration(match.groups.id);
    if (rehydResult && rehydResult.items.length > 0) {
      return rehydResult;
    }
  }

  return null;
}
