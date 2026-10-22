import type { ExtractedResult, ExtractedMediaItem } from './types';
import { randomAlphaNumeric, parseKNumber } from '../misc';

export const INSTAGRAM_SHARE_REGEX =
  /https?:\/\/(?:www\.)?(?:dd)?instagram\.com\/share\/(?:(?:reels?|video|s|p)\/)?(?<id>[^\/\?\s]+)/i;

export const INSTAGRAM_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:dd)?instagram\.com\/(?:reels?|p|tv)\/(?<id>[a-zA-Z0-9_-]+)/i;

function findObjectWithKey(obj: any, targetKey: string, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 12) return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    return obj[targetKey];
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const res = findObjectWithKey(val, targetKey, depth + 1);
      if (res) return res;
    }
  }
  return null;
}

/**
 * Decode JWT payload without external libraries (atob).
 * From DeltaBox/PagerApi.
 */
function decodeJwtPayload(
  tokenUrl: string
): { url?: string; filename?: string; [key: string]: any } | null {
  try {
    const urlObj = new URL(tokenUrl);
    const token = urlObj.searchParams.get('token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

/**
 * Zero-eval SnapSave unpacker (100% serverless safe).
 * From DeltaBox/PagerApi.
 */
function decodeSnapSave(
  h: string,
  _u: number,
  n: string,
  t: number,
  e: number,
  _r: number
): string {
  function decodeBase(d: string, eVal: number, fVal: number): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
    const hStr = chars.slice(0, eVal);
    const iStr = chars.slice(0, fVal);
    const jVal = d
      .split('')
      .reverse()
      .reduce((acc, b, c) => {
        if (hStr.indexOf(b) !== -1) return acc + hStr.indexOf(b) * Math.pow(eVal, c);
        return acc;
      }, 0);
    let k = '';
    let temp = jVal;
    while (temp > 0) {
      k = iStr[temp % fVal] + k;
      temp = Math.floor(temp / fVal);
    }
    return k || '0';
  }

  let result = '';
  for (let i = 0, len = h.length; i < len; i++) {
    let s = '';
    while (i < len && h[i] !== n[e]) {
      s += h[i];
      i++;
    }
    for (let j = 0; j < n.length; j++) {
      s = s.replace(new RegExp(n[j], 'g'), String(j));
    }
    result += String.fromCharCode(Number(decodeBase(s, e, 10)) - t);
  }
  try {
    return decodeURIComponent(escape(result));
  } catch {
    return result;
  }
}

/**
 * Resolve Instagram share/ links to canonical URL
 */
export async function resolveInstagramShareUrl(url: string): Promise<string> {
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
 * Method 1: Googlebot SSR (Guest mode for Carousels, Photos, Reels)
 */
async function extractViaSSR(shortcode: string): Promise<ExtractedResult | null> {
  try {
    const url = `https://www.instagram.com/p/${shortcode}/`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    let searchIndex = 0;
    while (searchIndex < html.length) {
      const scriptStart = html.indexOf('<script', searchIndex);
      if (scriptStart === -1) break;

      const scriptBodyStart = html.indexOf('>', scriptStart);
      if (scriptBodyStart === -1) break;

      const scriptEnd = html.indexOf('</script', scriptBodyStart);
      if (scriptEnd === -1) break;

      const content = html.substring(scriptBodyStart + 1, scriptEnd);
      searchIndex = scriptEnd + 8;

      if (!content.includes('xig_polaris_media')) continue;

      try {
        const json = JSON.parse(content);
        const polarisMedia = findObjectWithKey(json, 'xig_polaris_media');
        if (!polarisMedia) continue;

        const media = polarisMedia.if_not_gated_logged_out || polarisMedia;
        const author = {
          name: media.user?.full_name || media.user?.username,
          username: media.user?.username,
        };
        const caption = media.caption?.text || '';
        const stats =
          typeof media.like_count === 'number' || typeof media.comment_count === 'number'
            ? {
                likes: typeof media.like_count === 'number' ? media.like_count : undefined,
                comments: typeof media.comment_count === 'number' ? media.comment_count : undefined,
              }
            : undefined;
        const items: ExtractedMediaItem[] = [];

        if (Array.isArray(media.carousel_media) && media.carousel_media.length > 0) {
          for (const item of media.carousel_media) {
            if (item.video_url || item.video_versions?.length) {
              const videoUrl = item.video_url || item.video_versions[0].url;
              items.push({
                type: 'video',
                url: videoUrl,
                thumbnailUrl: item.display_uri || item.image_versions2?.candidates?.[0]?.url,
              });
            } else {
              const imgUrl = item.image_versions2?.candidates?.[0]?.url || item.display_uri;
              if (imgUrl) {
                items.push({
                  type: 'photo',
                  url: imgUrl,
                });
              }
            }
          }
        } else if (media.video_url || media.video_versions?.length) {
          items.push({
            type: 'video',
            url: media.video_url || media.video_versions[0].url,
            thumbnailUrl: media.display_uri || media.image_versions2?.candidates?.[0]?.url,
          });
        } else {
          const imgUrl = media.image_versions2?.candidates?.[0]?.url || media.display_uri;
          if (imgUrl) {
            items.push({
              type: 'photo',
              url: imgUrl,
            });
          }
        }

        if (items.length > 0) {
          return {
            platform: 'instagram',
            id: shortcode,
            caption,
            author,
            stats,
            items,
          };
        }
      } catch {
        // Try next script
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Method 2: SnapSave Engine (Battle-tested in DeltaBox/PagerApi)
 */
async function extractViaSnapSave(
  rawUrl: string,
  shortcode: string
): Promise<ExtractedResult | null> {
  try {
    const postUrl = `https://www.instagram.com/p/${shortcode}/`;
    const body = new URLSearchParams({ url: rawUrl || postUrl });

    const snapRes = await fetch('https://snapsave.app/action.php', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://snapsave.app/',
        Origin: 'https://snapsave.app',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!snapRes.ok) return null;
    const text = await snapRes.text();
    const match = text.match(
      /}\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
    );
    if (!match) return null;

    const [_, h, u, n, t, e, r] = match;
    const decodedHtml = decodeSnapSave(
      h,
      parseInt(u, 10),
      n,
      parseInt(t, 10),
      parseInt(e, 10),
      parseInt(r, 10)
    );

    const blocks = decodedHtml.split(/<div class=\\?"download-items\\?">/);
    const items: ExtractedMediaItem[] = [];

    if (blocks.length > 1) {
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const downloadMatch =
          block.match(/href=\\?"([^"\\<>]+)/i) || block.match(/<a[^>]+href=["\\]*([^"\\]+)/i);
        const thumbMatch =
          block.match(/img\s+src=\\?"([^"\\<>]+)/i) || block.match(/<img[^>]+src=["\\]*([^"\\]+)/i);

        const rawStreamUrl = downloadMatch
          ? downloadMatch[1].replace(/\\"/g, '').replace(/\\/g, '').replace(/&amp;/g, '&').trim()
          : '';
        const rawThumbUrl = thumbMatch
          ? thumbMatch[1].replace(/\\"/g, '').replace(/\\/g, '').replace(/&amp;/g, '&').trim()
          : '';

        if (!rawStreamUrl) continue;

        const jwt = decodeJwtPayload(rawStreamUrl);
        const directUrl = jwt?.url ? jwt.url : rawStreamUrl;

        const thumbJwt = decodeJwtPayload(rawThumbUrl);
        const directThumb = thumbJwt?.url ? thumbJwt.url : rawThumbUrl;

        const isVid =
          block.includes('icon-dlvideo') ||
          block.includes('Download video') ||
          rawStreamUrl.includes('.mp4') ||
          Boolean(directUrl && directUrl.includes('.mp4'));

        items.push({
          type: isVid ? 'video' : 'photo',
          url: directUrl,
          thumbnailUrl: directThumb || undefined,
        });
      }
    } else {
      const urls = decodedHtml.match(/https:\/\/[^\s"'`<>]+/g) || [];
      const streamUrls = urls.filter(
        (uStr) =>
          uStr.includes('rapidcdn.app/v2?token=') ||
          uStr.includes('snapcdn.app') ||
          uStr.includes('/v2?token=')
      );

      for (const sUrl of streamUrls) {
        const cleaned = sUrl.replace(/\\"/g, '').replace(/\\/g, '').replace(/&amp;/g, '&').trim();
        const jwt = decodeJwtPayload(cleaned);
        const directUrl = jwt?.url || cleaned;
        const isVid =
          /icon-dlvideo|download video/i.test(decodedHtml) || directUrl.includes('.mp4');

        items.push({
          type: isVid ? 'video' : 'photo',
          url: directUrl,
        });
      }
    }

    if (items.length > 0) {
      return {
        platform: 'instagram',
        id: shortcode,
        items,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Method 3: OpenGraph Crawler Meta (Facebook crawler fallback)
 */
async function extractViaOG(shortcode: string): Promise<ExtractedResult | null> {
  try {
    const url = `https://www.instagram.com/p/${shortcode}/`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const ogVideo = html.match(
      /property=["']og:video(?::secure_url)?["']\s+content=["']([^"']+)["']/i
    );
    const ogImage = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const ogTitle = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
    const ogDesc = html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i);

    if (ogVideo?.[1] || ogImage?.[1]) {
      const items: ExtractedMediaItem[] = [];
      if (ogVideo?.[1]) {
        items.push({
          type: 'video',
          url: ogVideo[1].replace(/&amp;/g, '&'),
          thumbnailUrl: ogImage?.[1]?.replace(/&amp;/g, '&'),
        });
      } else if (ogImage?.[1]) {
        items.push({
          type: 'photo',
          url: ogImage[1].replace(/&amp;/g, '&'),
        });
      }

      let caption = '';
      let author: { name?: string; username?: string } | undefined;
      let stats: { likes?: number; comments?: number } | undefined;

      if (ogDesc?.[1]) {
        const descText = ogDesc[1];
        const likeMatch = descText.match(/([\d.,KMkm]+)\s+likes/i);
        const commentMatch = descText.match(/([\d.,KMkm]+)\s+comments/i);
        const authorMatch = descText.match(/-\s*([a-zA-Z0-9_.-]+)\s+on/i);

        if (authorMatch?.[1]) {
          author = { username: authorMatch[1], name: authorMatch[1] };
        }

        const likes = likeMatch ? parseKNumber(likeMatch[1]) : undefined;
        const comments = commentMatch ? parseKNumber(commentMatch[1]) : undefined;
        if (likes !== undefined || comments !== undefined) {
          stats = { likes, comments };
        }

        const captionMatch = descText.match(/:\s*(?:&quot;|")([\s\S]*?)(?:&quot;|")\.?\s*$/);
        if (captionMatch?.[1]) {
          caption = captionMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&#064;/g, '@')
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&')
            .trim();
        }
      }

      if (!caption && ogTitle?.[1]) {
        caption = ogTitle[1]
          .replace(/&quot;/g, '"')
          .replace(/&#064;/g, '@')
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();
      }

      return {
        platform: 'instagram',
        id: shortcode,
        caption,
        author,
        stats,
        items,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Method 4: Guest GraphQL API
 */
async function extractViaGQL(shortcode: string): Promise<ExtractedResult | null> {
  try {
    const csrfToken = randomAlphaNumeric(32);
    const deviceId = randomAlphaNumeric(24);
    const machineId = randomAlphaNumeric(24);

    const cookie = `csrftoken=${csrfToken}; ig_did=${deviceId}; wd=1280x720; dpr=2; mid=${machineId}; ig_nrcb=1`;

    const body = new URLSearchParams({
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
      variables: JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      }),
      server_timestamps: 'true',
      doc_id: '8845758582119845',
    });

    const res = await fetch('https://www.instagram.com/graphql/query/', {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
        origin: 'https://www.instagram.com',
        referer: `https://www.instagram.com/p/${shortcode}/`,
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'x-asbd-id': '129477',
        'x-csrftoken': csrfToken,
        'x-ig-app-id': '936619743392459',
      },
      body: body.toString(),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const media = json?.data?.xdt_shortcode_media || json?.data?.shortcode_media;
    if (!media) return null;

    return parseShortcodeMedia(shortcode, media);
  } catch {
    return null;
  }
}

/**
 * Method 5: Embed Page Scraping
 */
async function extractViaEmbed(shortcode: string): Promise<ExtractedResult | null> {
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const videoMatch = html.match(/"video_url":"([^"]+)"/);
    const displayMatch = html.match(/"display_url":"([^"]+)"/);

    if (videoMatch?.[1]) {
      const videoUrl = JSON.parse(`"${videoMatch[1]}"`);
      const thumbnailUrl = displayMatch?.[1] ? JSON.parse(`"${displayMatch[1]}"`) : undefined;

      return {
        platform: 'instagram',
        id: shortcode,
        items: [
          {
            type: 'video',
            url: videoUrl,
            thumbnailUrl,
          },
        ],
      };
    }

    if (displayMatch?.[1]) {
      const displayUrl = JSON.parse(`"${displayMatch[1]}"`);
      return {
        platform: 'instagram',
        id: shortcode,
        items: [
          {
            type: 'photo',
            url: displayUrl,
          },
        ],
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parseShortcodeMedia(shortcode: string, media: any): ExtractedResult {
  const items: ExtractedMediaItem[] = [];
  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || media.caption || '';

  const author = {
    name: media.owner?.full_name,
    username: media.owner?.username,
  };

  const likes =
    media.edge_media_preview_like?.count ??
    media.edge_liked_by?.count ??
    (typeof media.like_count === 'number' ? media.like_count : undefined);
  const comments =
    media.edge_media_to_comment?.count ??
    (typeof media.comment_count === 'number' ? media.comment_count : undefined);
  const stats = likes !== undefined || comments !== undefined ? { likes, comments } : undefined;

  if (media.edge_sidecar_to_children?.edges?.length > 0) {
    for (const edge of media.edge_sidecar_to_children.edges) {
      const node = edge.node;
      if (node.is_video && node.video_url) {
        items.push({
          type: 'video',
          url: node.video_url,
          thumbnailUrl: node.display_url,
        });
      } else if (node.display_url) {
        items.push({
          type: 'photo',
          url: node.display_url,
        });
      }
    }
  } else if (media.is_video && media.video_url) {
    items.push({
      type: 'video',
      url: media.video_url,
      thumbnailUrl: media.display_url,
    });
  } else if (media.display_url) {
    items.push({
      type: 'photo',
      url: media.display_url,
    });
  }

  return {
    platform: 'instagram',
    id: shortcode,
    caption,
    author,
    stats,
    items,
  };
}

/**
 * Main Instagram extractor:
 * Chains SSR (Googlebot) -> SnapSave Engine -> OpenGraph -> Guest GQL -> Embed
 */
export async function extractInstagram(inputUrl: string): Promise<ExtractedResult | null> {
  let url = inputUrl;
  if (INSTAGRAM_SHARE_REGEX.test(url)) {
    url = await resolveInstagramShareUrl(url);
  }

  const match = url.match(INSTAGRAM_URL_REGEX);
  if (!match?.groups?.id) return null;
  const shortcode = match.groups.id;

  let result: ExtractedResult | null = null;

  // 1. Googlebot SSR (Direct full resolution carousel, video, photo)
  const ssrResult = await extractViaSSR(shortcode);
  if (ssrResult && ssrResult.items.length > 0) {
    result = ssrResult;
  }

  // 2. SnapSave Engine (Zero-eval decoder from DeltaBox/PagerApi)
  if (!result) {
    const snapResult = await extractViaSnapSave(url, shortcode);
    if (snapResult && snapResult.items.length > 0) {
      result = snapResult;
    }
  }

  // 3. OpenGraph Crawler Meta (Facebook crawler fallback)
  if (!result) {
    const ogResult = await extractViaOG(shortcode);
    if (ogResult && ogResult.items.length > 0) {
      result = ogResult;
    }
  }

  // 4. Guest GQL API
  if (!result) {
    const gqlResult = await extractViaGQL(shortcode);
    if (gqlResult && gqlResult.items.length > 0) {
      result = gqlResult;
    }
  }

  // 5. Embed Scraper
  if (!result) {
    const embedResult = await extractViaEmbed(shortcode);
    if (embedResult && embedResult.items.length > 0) {
      result = embedResult;
    }
  }

  if (!result) return null;

  // Enrich missing metadata (caption, author, stats) via OpenGraph if needed
  if (!result.caption || !result.author?.username || !result.stats) {
    try {
      const ogMeta = await extractViaOG(shortcode);
      if (ogMeta) {
        if (!result.caption && ogMeta.caption) result.caption = ogMeta.caption;
        if ((!result.author || !result.author.username) && ogMeta.author) {
          result.author = ogMeta.author;
        }
        if (!result.stats && ogMeta.stats) result.stats = ogMeta.stats;
      }
    } catch {
      // Ignore
    }
  }

  return result;
}
