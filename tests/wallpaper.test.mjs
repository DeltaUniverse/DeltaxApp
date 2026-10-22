import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Deltax App - Wallpaper Module Utilities & Argument Parser', () => {
  const BING_RESOLUTIONS = {
    '1366': '1366x768.jpg',
    '1920': '1920x1080.jpg',
    '3840': 'UHD.jpg',
    'UHD': 'UHD.jpg',
    'uhd': 'UHD.jpg',
    '4k': 'UHD.jpg',
    '4K': 'UHD.jpg',
    '1080x1920': '1080x1920.jpg',
  };

  function resolveResolutionSuffix(resolution = '1920') {
    const trimmed = resolution.trim();
    const found = BING_RESOLUTIONS[trimmed] || BING_RESOLUTIONS[trimmed.toUpperCase()];
    if (found) return found;
    return '1920x1080.jpg';
  }

  test('resolveResolutionSuffix maps shorthand and standard resolutions', () => {
    assert.equal(resolveResolutionSuffix('UHD'), 'UHD.jpg');
    assert.equal(resolveResolutionSuffix('4k'), 'UHD.jpg');
    assert.equal(resolveResolutionSuffix('1920'), '1920x1080.jpg');
    assert.equal(resolveResolutionSuffix('1080x1920'), '1080x1920.jpg');
    assert.equal(resolveResolutionSuffix('unknown'), '1920x1080.jpg');
  });

  const BING_MARKET_ALIASES = {
    us: 'en-US',
    usa: 'en-US',
    'en-us': 'en-US',
    cn: 'zh-CN',
    zh: 'zh-CN',
    china: 'zh-CN',
    'zh-cn': 'zh-CN',
    jp: 'ja-JP',
    ja: 'ja-JP',
    japan: 'ja-JP',
    'ja-jp': 'ja-JP',
    uk: 'en-GB',
    gb: 'en-GB',
    'en-gb': 'en-GB',
    de: 'de-DE',
    germany: 'de-DE',
    'de-de': 'de-DE',
    fr: 'fr-FR',
    france: 'fr-FR',
    'fr-fr': 'fr-FR',
    it: 'it-IT',
    italy: 'it-IT',
    'it-it': 'it-IT',
    es: 'es-ES',
    spain: 'es-ES',
    'es-es': 'es-ES',
    ca: 'en-CA',
    canada: 'en-CA',
    'en-ca': 'en-CA',
    au: 'en-AU',
    australia: 'en-AU',
    'en-au': 'en-AU',
    in: 'en-IN',
    india: 'en-IN',
    'en-in': 'en-IN',
    row: 'en-ROW',
    global: 'en-ROW',
    world: 'en-ROW',
  };

  function resolveMarket(input) {
    if (!input) return undefined;
    const lower = input.trim().toLowerCase();
    if (BING_MARKET_ALIASES[lower]) return BING_MARKET_ALIASES[lower];
    return undefined;
  }

  test('resolveMarket maps simplified country codes and country names to Bing markets', () => {
    assert.equal(resolveMarket('us'), 'en-US');
    assert.equal(resolveMarket('USA'), 'en-US');
    assert.equal(resolveMarket('jp'), 'ja-JP');
    assert.equal(resolveMarket('japan'), 'ja-JP');
    assert.equal(resolveMarket('cn'), 'zh-CN');
    assert.equal(resolveMarket('china'), 'zh-CN');
    assert.equal(resolveMarket('uk'), 'en-GB');
    assert.equal(resolveMarket('de'), 'de-DE');
    assert.equal(resolveMarket('germany'), 'de-DE');
    assert.equal(resolveMarket('fr'), 'fr-FR');
    assert.equal(resolveMarket('global'), 'en-ROW');
    assert.equal(resolveMarket('unknown_xyz'), undefined);
  });

  test('parses wallpaper command arguments correctly', () => {
    function parseWallpaperArgs(args) {
      const result = {};
      for (const arg of args) {
        const raw = arg.trim();
        const lower = raw.toLowerCase();
        if (lower.startsWith('@')) {
          continue;
        }
        if (lower === 'random') {
          result.index = 'random';
          continue;
        }
        if (lower === 'uhd' || lower === '4k' || lower === '1920' || lower === '1366') {
          result.resolution = raw;
          continue;
        }
        if (/^[0-7]$/.test(raw)) {
          result.index = parseInt(raw, 10);
          continue;
        }
        if (lower.startsWith('mkt:') || lower.startsWith('market:')) {
          const val = lower.replace(/^mkt:|^market:/, '');
          const resolved = resolveMarket(val);
          if (resolved) {
            result.mkt = resolved;
            continue;
          }
        }
        const resolvedMkt = resolveMarket(raw);
        if (resolvedMkt) {
          result.mkt = resolvedMkt;
          continue;
        }
      }
      return result;
    }

    assert.deepEqual(parseWallpaperArgs(['UHD', 'en-US']), { resolution: 'UHD', mkt: 'en-US' });
    assert.deepEqual(parseWallpaperArgs(['4k', 'us']), { resolution: '4k', mkt: 'en-US' });
    assert.deepEqual(parseWallpaperArgs(['jp', 'random']), { mkt: 'ja-JP', index: 'random' });
    assert.deepEqual(parseWallpaperArgs(['uk', '2']), { mkt: 'en-GB', index: 2 });
    assert.deepEqual(parseWallpaperArgs(['china', 'uhd']), { mkt: 'zh-CN', resolution: 'uhd' });
    assert.deepEqual(parseWallpaperArgs(['mkt:de']), { mkt: 'de-DE' });
    assert.deepEqual(parseWallpaperArgs(['random']), { index: 'random' });
    assert.deepEqual(parseWallpaperArgs(['random', '@deltaxapp']), { index: 'random' });
    assert.deepEqual(parseWallpaperArgs(['@deltaxapp', 'random']), { index: 'random' });
    assert.deepEqual(parseWallpaperArgs(['2']), { index: 2 });
  });
});
