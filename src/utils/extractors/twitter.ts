import type { ExtractedResult, ExtractedMediaItem } from './types';

const TWITTER_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export const TWITTER_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:fx|vx|fixup)?(?:twitter|x)\.com\/(?:[^/\s]+)\/status\/(?<id>\d+)/i;

export const TCO_URL_REGEX = /https?:\/\/t\.co\/(?<id>[\w-]+)/i;

interface FxMediaVariant {
  content_type?: string;
  url?: string;
  bitrate?: number;
}

interface FxMedia {
  type?: 'video' | 'gif' | 'photo';
  url?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  variants?: FxMediaVariant[];
}

interface FxTweet {
  author?: {
    name?: string;
    screen_name?: string;
  };
  text?: string;
  media?: {
    all?: FxMedia[];
    photos?: Array<{ url: string }>;
    videos?: Array<{
      url?: string;
      thumbnail_url?: string;
      variants?: FxMediaVariant[];
    }>;
  };
  likes?: number;
  favorites?: number;
  replies?: number;
  retweets?: number;
  views?: number;
}

interface FxTwitterResponse {
  tweet?: FxTweet;
}

interface TwitterMediaVariant {
  content_type?: string;
  url?: string;
  bitrate?: number;
}

interface TwitterMediaEntity {
  type?: string;
  media_url_https?: string;
  video_info?: {
    variants?: TwitterMediaVariant[];
  };
}

interface TwitterTweetResult {
  data?: {
    tweetResult?: {
      result?: {
        legacy?: {
          full_text?: string;
          extended_entities?: { media?: TwitterMediaEntity[] };
          entities?: { media?: TwitterMediaEntity[] };
        };
        tweet?: {
          legacy?: {
            full_text?: string;
            extended_entities?: { media?: TwitterMediaEntity[] };
            entities?: { media?: TwitterMediaEntity[] };
          };
        };
        core?: {
          user_results?: {
            result?: {
              legacy?: {
                name?: string;
                screen_name?: string;
              };
            };
          };
        };
      };
    };
  };
}

interface VxTwitterResponse {
  error?: unknown;
  mediaURLs?: string[];
  hasMedia?: string;
  text?: string;
  user_name?: string;
  user_screen_name?: string;
}

/**
 * Resolve t.co short links to canonical tweet URL
 */
export async function resolveTco(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
}

/**
 * Method 1: FxTwitter API (Fastest, rich metadata, all video variants).
 * Sourced from DeltaBox/PagerApi.
 */
async function extractViaFxTwitter(tweetId: string): Promise<ExtractedResult | null> {
  try {
    const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
    const res = await fetch(apiUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = await res.json<FxTwitterResponse>();
    if (!data?.tweet) return null;

    const tweet = data.tweet;
    const author = {
      name: tweet.author?.name,
      username: tweet.author?.screen_name,
    };
    const caption = tweet.text || '';
    const items: ExtractedMediaItem[] = [];

    const allMedia = tweet.media?.all || [];
    if (allMedia.length > 0) {
      for (const m of allMedia) {
        if (m.type === 'video' || m.type === 'gif') {
          const variants = m.variants || [];
          const mp4s = variants
            .filter(
              (v): v is FxMediaVariant & { url: string } =>
                v.content_type === 'video/mp4' && Boolean(v.url)
            )
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

          const bestUrl = mp4s[0]?.url || m.url;
          if (bestUrl) {
            items.push({
              type: 'video',
              url: bestUrl,
              thumbnailUrl: m.thumbnail_url,
              width: m.width,
              height: m.height,
            });
          }
        } else if (m.type === 'photo' && m.url) {
          items.push({
            type: 'photo',
            url: m.url,
            width: m.width,
            height: m.height,
          });
        }
      }
    } else if (tweet.media?.photos && tweet.media.photos.length > 0) {
      for (const p of tweet.media.photos) {
        items.push({
          type: 'photo',
          url: p.url,
        });
      }
    } else if (tweet.media?.videos && tweet.media.videos.length > 0) {
      for (const v of tweet.media.videos) {
        const variants = v.variants || [];
        const mp4s = variants
          .filter(
            (va): va is FxMediaVariant & { url: string } =>
              va.content_type === 'video/mp4' && Boolean(va.url)
          )
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        const bestUrl = mp4s[0]?.url || v.url;
        if (bestUrl) {
          items.push({
            type: 'video',
            url: bestUrl,
            thumbnailUrl: v.thumbnail_url,
          });
        }
      }
    }

    if (items.length > 0) {
      return {
        platform: 'twitter',
        id: tweetId,
        caption,
        author,
        stats: {
          likes: typeof tweet.likes === 'number' ? tweet.likes : tweet.favorites,
          comments: typeof tweet.replies === 'number' ? tweet.replies : undefined,
          shares: typeof tweet.retweets === 'number' ? tweet.retweets : undefined,
          views: typeof tweet.views === 'number' ? tweet.views : undefined,
        },
        items,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fetch guest token from Twitter Guest API
 */
async function getGuestToken(): Promise<string | null> {
  try {
    const res = await fetch('https://api.x.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: {
        authorization: TWITTER_BEARER,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const data = await res.json<{ guest_token?: string }>();
    return data.guest_token || null;
  } catch {
    return null;
  }
}

/**
 * Method 2: Extract Twitter media using Twitter GraphQL Guest Mode API
 */
async function extractViaGuestApi(tweetId: string): Promise<ExtractedResult | null> {
  const guestToken = await getGuestToken();
  if (!guestToken) return null;

  const variables = {
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  };
  const features = {
    creator_subscriptions_tweet_preview_api_enabled: true,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
  };

  const url = `https://x.com/i/api/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId?variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}&features=${encodeURIComponent(JSON.stringify(features))}`;

  const res = await fetch(url, {
    headers: {
      authorization: TWITTER_BEARER,
      'x-guest-token': guestToken,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      accept: '*/*',
    },
  });

  if (!res.ok) return null;
  const data = await res.json<TwitterTweetResult>();
  const tweetResult = data?.data?.tweetResult?.result;
  if (!tweetResult) return null;

  const tweet = tweetResult.legacy || tweetResult.tweet?.legacy;
  if (!tweet) return null;

  const user = tweetResult.core?.user_results?.result?.legacy;
  const caption = tweet.full_text || '';
  const mediaEntities = tweet.extended_entities?.media || tweet.entities?.media || [];

  const items: ExtractedMediaItem[] = [];

  for (const entity of mediaEntities) {
    if (entity.type === 'video' || entity.type === 'animated_gif') {
      const variants = entity.video_info?.variants || [];
      const mp4s = variants
        .filter(
          (v): v is TwitterMediaVariant & { url: string } =>
            v.content_type === 'video/mp4' && Boolean(v.url)
        )
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      if (mp4s.length > 0) {
        items.push({
          type: 'video',
          url: mp4s[0].url,
          thumbnailUrl: entity.media_url_https,
        });
      }
    } else if (entity.type === 'photo' && entity.media_url_https) {
      items.push({
        type: 'photo',
        url: entity.media_url_https,
      });
    }
  }

  if (items.length === 0) return null;

  return {
    platform: 'twitter',
    id: tweetId,
    caption,
    author: {
      name: user?.name,
      username: user?.screen_name,
    },
    items,
  };
}

/**
 * Method 3: Fallback VxTwitter API
 */
async function extractViaVxTwitter(tweetId: string): Promise<ExtractedResult | null> {
  try {
    const res = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) return null;
    const data = await res.json<VxTwitterResponse>();
    if (!data || data.error) return null;

    const items: ExtractedMediaItem[] = [];

    if (data.mediaURLs && Array.isArray(data.mediaURLs)) {
      for (const mUrl of data.mediaURLs) {
        const isVideo =
          mUrl.includes('.mp4') || mUrl.includes('/video/') || data.hasMedia === 'video';

        items.push({
          type: isVideo ? 'video' : 'photo',
          url: mUrl,
        });
      }
    }

    if (items.length === 0) return null;

    return {
      platform: 'twitter',
      id: tweetId,
      caption: data.text || '',
      author: {
        name: data.user_name,
        username: data.user_screen_name,
      },
      items,
    };
  } catch {
    return null;
  }
}

/**
 * Extract Twitter media chaining:
 * FxTwitter API -> Twitter GraphQL Guest API -> VxTwitter
 */
export async function extractTwitter(inputUrl: string): Promise<ExtractedResult | null> {
  let url = inputUrl;
  if (TCO_URL_REGEX.test(url)) {
    url = await resolveTco(url);
  }

  const match = url.match(TWITTER_URL_REGEX);
  if (!match?.groups?.id) return null;
  const tweetId = match.groups.id;

  const fxResult = await extractViaFxTwitter(tweetId);
  if (fxResult && fxResult.items.length > 0) {
    return fxResult;
  }

  const guestResult = await extractViaGuestApi(tweetId);
  if (guestResult && guestResult.items.length > 0) {
    return guestResult;
  }

  const vxResult = await extractViaVxTwitter(tweetId);
  if (vxResult && vxResult.items.length > 0) {
    return vxResult;
  }

  return null;
}
