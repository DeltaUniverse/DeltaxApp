import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const TWITTER_URL_REGEX =
  /https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter\.com|x\.com)|(?:fxtwitter\.com|vxtwitter\.com|fixupx\.com))\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i;
const TCO_URL_REGEX = /https?:\/\/t\.co\/([a-zA-Z0-9_-]+)/i;

const TIKTOK_URL_REGEX =
  /https?:\/\/(?:(?:www|m)\.)?(?:vx)?tiktok\.com\/(?:(?:embed|@[\w.-]*)\/)?(?:v(?:ideo)?|p(?:hoto)?)\/(?<id>\d+)/i;
const TIKTOK_VM_REGEX =
  /https?:\/\/(?:(?:vm|vt|www)\.)?(?:vx)?tiktok\.com\/(?:t\/)?(?<id>[a-zA-Z0-9_-]+)/i;
const TIKTOK_LIVE_REGEX =
  /https?:\/\/(?:(?:www|m)\.)?(?:vx)?tiktok\.com\/(?:@(?<username>[\w.-]+)\/)?live(?:\?[^\s"'<>]*)?/i;

const INSTAGRAM_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i;
const INSTAGRAM_SHARE_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/share\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i;

function findSupportedUrl(text) {
  if (!text) return null;

  const igShareMatch = text.match(INSTAGRAM_SHARE_REGEX);
  if (igShareMatch) {
    return { platform: 'instagram', url: igShareMatch[0] };
  }

  const igMatch = text.match(INSTAGRAM_URL_REGEX);
  if (igMatch) {
    return { platform: 'instagram', url: igMatch[0] };
  }

  const ttMatch =
    text.match(TIKTOK_URL_REGEX) || text.match(TIKTOK_VM_REGEX) || text.match(TIKTOK_LIVE_REGEX);
  if (ttMatch) {
    return { platform: 'tiktok', url: ttMatch[0] };
  }

  const twMatch = text.match(TWITTER_URL_REGEX);
  if (twMatch) {
    return { platform: 'twitter', url: twMatch[0] };
  }

  const tcoMatch = text.match(TCO_URL_REGEX);
  if (tcoMatch) {
    return { platform: 'twitter', url: tcoMatch[0] };
  }

  return null;
}

describe('Deltax App - Media Extractor URL Detectors', () => {
  test('correctly identifies Instagram URLs', () => {
    const postUrl = 'https://www.instagram.com/p/C9V7v2JvX9G/';
    const reelUrl = 'https://instagram.com/reel/DCmU014S6iP/?igsh=abc';
    const shareUrl = 'https://www.instagram.com/share/reel/123abcXYZ';

    assert.equal(findSupportedUrl(postUrl)?.platform, 'instagram');
    assert.equal(findSupportedUrl(reelUrl)?.platform, 'instagram');
    assert.equal(findSupportedUrl(shareUrl)?.platform, 'instagram');

    assert.ok(INSTAGRAM_URL_REGEX.test(postUrl));
    assert.ok(INSTAGRAM_URL_REGEX.test(reelUrl));
    assert.ok(INSTAGRAM_SHARE_REGEX.test(shareUrl));
  });

  test('correctly identifies TikTok URLs', () => {
    const webUrl = 'https://www.tiktok.com/@user/video/7106594312292453675';
    const vmUrl = 'https://vm.tiktok.com/ZMhdR5t9/';
    const vtUrl = 'https://vt.tiktok.com/ZS23abcd/';
    const vtLongUrl = 'https://vt.tiktok.com/ZS9U7xh4YHw89-31OFR/';
    const liveUrl = 'https://www.tiktok.com/@gitazzah/live';

    assert.equal(findSupportedUrl(webUrl)?.platform, 'tiktok');
    assert.equal(findSupportedUrl(vmUrl)?.platform, 'tiktok');
    assert.equal(findSupportedUrl(vtUrl)?.platform, 'tiktok');
    assert.equal(findSupportedUrl(vtLongUrl)?.platform, 'tiktok');
    assert.equal(findSupportedUrl(liveUrl)?.platform, 'tiktok');

    assert.ok(TIKTOK_URL_REGEX.test(webUrl));
    assert.ok(TIKTOK_VM_REGEX.test(vmUrl));
    assert.ok(TIKTOK_VM_REGEX.test(vtUrl));
    assert.ok(TIKTOK_VM_REGEX.test(vtLongUrl));
    assert.ok(TIKTOK_LIVE_REGEX.test(liveUrl));
  });

  test('correctly identifies Twitter / X URLs', () => {
    const xUrl = 'https://x.com/jack/status/20';
    const twitterUrl = 'https://twitter.com/user/status/1234567890123456789';
    const fxUrl = 'https://fxtwitter.com/user/status/987654321';
    const tcoUrl = 'https://t.co/abcXYZ123';

    assert.equal(findSupportedUrl(xUrl)?.platform, 'twitter');
    assert.equal(findSupportedUrl(twitterUrl)?.platform, 'twitter');
    assert.equal(findSupportedUrl(fxUrl)?.platform, 'twitter');
    assert.equal(findSupportedUrl(tcoUrl)?.platform, 'twitter');

    assert.ok(TWITTER_URL_REGEX.test(xUrl));
    assert.ok(TWITTER_URL_REGEX.test(twitterUrl));
  });

  test('returns null for unsupported URLs or plain text', () => {
    assert.equal(findSupportedUrl('https://google.com'), null);
    assert.equal(findSupportedUrl('https://youtube.com/watch?v=123'), null);
    assert.equal(findSupportedUrl('Hello world how are you'), null);
    assert.equal(findSupportedUrl(''), null);
  });
});
