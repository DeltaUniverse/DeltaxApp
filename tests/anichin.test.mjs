import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHtmlEntities,
  cleanHtmlText,
  normalizeAnichinUrl,
  extractAnichinSlug,
  isAnichinUrl,
  safeBase64Decode,
  parseSearchResultHtml,
  parseLatestResultHtml,
  parseDetailHtml,
  parseEpisodeHtml,
  parseScheduleHtml,
  levenshteinDistance,
  computeQuerySimilarity,
  AnichinScraper,
  ANICHIN_GENRES,
} from '../src/utils/extractors/anichin.ts';

const ANICHIN_CATEGORY_COLS = 2;
const ANICHIN_CATEGORY_ROWS = 3;
const ANICHIN_CATEGORY_PAGE_SIZE = ANICHIN_CATEGORY_COLS * ANICHIN_CATEGORY_ROWS; // 6

const ANICHIN_DAYS = [
  { key: 'senin', name: 'Senin' },
  { key: 'selasa', name: 'Selasa' },
  { key: 'rabu', name: 'Rabu' },
  { key: 'kamis', name: 'Kamis' },
  { key: 'jumat', name: "Jum'at" },
  { key: 'sabtu', name: 'Sabtu' },
  { key: 'minggu', name: 'Minggu' },
  { key: 'acak', name: 'Acak' },
];

function normalizeDayKey(day) {
  return day.toLowerCase().replace(/['`\s-]/g, '');
}

function formatButtonTitle(title, maxLength = 16) {
  if (!title) return '';
  const clean = title
    .replace(/\s*[-–—:]*\s*(?:Subtitle\s+Indonesia|Sub\s+Indo|Subtitle\s+Indo)\b/gi, '')
    .replace(/\s*\(Donghua\)/gi, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function appendFooterButtons(rows, isGuest = false, showMenu = true) {
  const footerRow = [];
  if (showMenu) {
    footerRow.push({ text: '‹ Main Menu', callback_data: 'ani:menu:1' });
  }
  if (!isGuest) {
    footerRow.push({ text: 'Close', callback_data: 'ani:close' });
  }
  if (footerRow.length > 0) {
    rows.push(footerRow);
  }
}

function buildAnichinMainMenuKeyboard(page = 1, isGuest = false) {
  const rows = [];
  rows.push([
    { text: 'New Releases', callback_data: 'ani:l:1' },
    { text: 'Schedule', callback_data: 'ani:sched' },
  ]);

  const totalGenres = ANICHIN_GENRES.length;
  const totalPages = Math.max(1, Math.ceil(totalGenres / ANICHIN_CATEGORY_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (currentPage - 1) * ANICHIN_CATEGORY_PAGE_SIZE;
  const pageGenres = ANICHIN_GENRES.slice(startIndex, startIndex + ANICHIN_CATEGORY_PAGE_SIZE);

  let currentRow = [];
  for (const genre of pageGenres) {
    currentRow.push({ text: genre.name, callback_data: `ani:cat:${genre.slug}:1` });
    if (currentRow.length === ANICHIN_CATEGORY_COLS) {
      rows.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  if (totalPages > 1) {
    const prevPage = currentPage > 1 ? currentPage - 1 : totalPages;
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
    rows.push([
      { text: '‹ Prev', callback_data: `ani:cp:${prevPage}` },
      {
        text: `${currentPage}/${totalPages}`,
        callback_data: `ani:noop:${currentPage}:${totalPages}`,
      },
      { text: 'Next ›', callback_data: `ani:cp:${nextPage}` },
    ]);
  }

  if (!isGuest) {
    rows.push([{ text: 'Close', callback_data: 'ani:close' }]);
  }

  return { inline_keyboard: rows };
}

function buildAnichinScheduleKeyboard(isGuest = false) {
  const rows = [];
  let currentRow = [];
  for (const day of ANICHIN_DAYS) {
    currentRow.push({ text: day.name, callback_data: `ani:day:${day.key}:1` });
    if (currentRow.length === 2) {
      rows.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  appendFooterButtons(rows, isGuest, true);
  return { inline_keyboard: rows };
}

function renderAnichinMainMenu(page = 1, prefix = '/', isGuest = false) {
  const text =
    `<b>Anichin Donghua</b>\n\n` +
    `Nonton and download Donghua Subtitle Indonesia from <a href="https://anichin.moe/">Anichin.moe</a>.\n\n` +
    `<b>Commands:</b>\n` +
    `• <code>${prefix}anichin &lt;title&gt;</code> — Search Donghua by name\n` +
    `• <code>${prefix}anichin latest [page]</code> — Browse latest episodes\n` +
    `• <code>${prefix}anichin schedule [day]</code> — Release schedule by day\n` +
    `• <code>${prefix}anichin detail &lt;slug|url&gt;</code> — Full series info & episodes\n` +
    `• <code>${prefix}anichin ep &lt;slug|url&gt;</code> — Streaming video & download links\n\n` +
    `<b>Examples:</b>\n` +
    `• <code>${prefix}anichin martial</code>\n` +
    `• <code>${prefix}anichin latest</code>\n` +
    `• <code>${prefix}anichin schedule senin</code>\n` +
    `• <code>${prefix}anichin detail renegade-immortal</code>`;
  return { text, keyboard: buildAnichinMainMenuKeyboard(page, isGuest) };
}

function renderDayScheduleText(day, dayKey = 'senin', page = 1, isGuest = false) {
  const SCHEDULE_PAGE_SIZE = 8;
  const totalAnime = day.anime.length;
  const totalPages = Math.max(1, Math.ceil(totalAnime / SCHEDULE_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * SCHEDULE_PAGE_SIZE;
  const pageAnime = day.anime.slice(startIndex, startIndex + SCHEDULE_PAGE_SIZE);

  const pageSuffix = totalPages > 1 ? `, Page ${currentPage}/${totalPages}` : '';
  let text = `<b>Release Schedule — ${day.day}</b> (${totalAnime} titles${pageSuffix})\n\n`;
  if (totalAnime === 0) {
    text += `<i>No scheduled releases found for this day.</i>`;
  } else {
    text += `<b>Scheduled Titles:</b>\n`;
    for (let i = 0; i < pageAnime.length; i++) {
      const a = pageAnime[i];
      text += `${startIndex + i + 1}. <a href="${a.url}">${a.title}</a>\n`;
    }
  }

  const rows = [];
  const topItems = pageAnime.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      rows.push([
        { text: formatButtonTitle(b1.title, 16), callback_data: `ani:d:${b1.id}` },
        { text: formatButtonTitle(b2.title, 16), callback_data: `ani:d:${b2.id}` },
      ]);
    } else if (b1) {
      rows.push([{ text: formatButtonTitle(b1.title, 32), callback_data: `ani:d:${b1.id}` }]);
    }
  }

  if (totalPages > 1) {
    const prevPage = currentPage > 1 ? currentPage - 1 : totalPages;
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
    rows.push([
      { text: '‹ Prev', callback_data: `ani:day:${dayKey}:${prevPage}` },
      {
        text: `${currentPage}/${totalPages}`,
        callback_data: `ani:noop:${currentPage}:${totalPages}`,
      },
      { text: 'Next ›', callback_data: `ani:day:${dayKey}:${nextPage}` },
    ]);
  }

  const dayIdx = ANICHIN_DAYS.findIndex((d) => d.key === dayKey);
  if (dayIdx !== -1) {
    const prevDay = ANICHIN_DAYS[(dayIdx - 1 + ANICHIN_DAYS.length) % ANICHIN_DAYS.length];
    const nextDay = ANICHIN_DAYS[(dayIdx + 1) % ANICHIN_DAYS.length];
    rows.push([
      { text: `‹ ${prevDay.name}`, callback_data: `ani:day:${prevDay.key}:1` },
      { text: `${nextDay.name} ›`, callback_data: `ani:day:${nextDay.key}:1` },
    ]);
  }

  rows.push([
    { text: '‹ All Days', callback_data: 'ani:sched' },
    { text: '‹ Main Menu', callback_data: 'ani:menu:1' },
  ]);

  if (!isGuest) {
    rows.push([{ text: 'Close', callback_data: 'ani:close' }]);
  }

  return { text, keyboard: { inline_keyboard: rows } };
}

function renderSearchResultsText(res, prefix, isGuest = false) {
  let text =
    `<b>Anichin Search:</b> <code>${res.query}</code> (Page ${res.page})\n\n` + `<b>Results:</b>\n`;
  for (let i = 0; i < res.results.length; i++) {
    const item = res.results[i];
    const statusPart = item.status ? ` [${item.status}]` : '';
    const epPart = item.episode ? ` (${item.episode})` : '';
    text += `${i + 1}. <a href="${item.url}">${item.title}</a>${epPart}${statusPart}\n`;
  }
  text += `\n<i>Use <code>${prefix}anichin detail &lt;slug&gt;</code> to view full series details.</i>`;

  const rows = [];
  const topItems = res.results.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      rows.push([
        { text: formatButtonTitle(b1.title, 16), callback_data: `ani:d:${b1.id}` },
        { text: formatButtonTitle(b2.title, 16), callback_data: `ani:d:${b2.id}` },
      ]);
    } else if (b1) {
      rows.push([{ text: formatButtonTitle(b1.title, 32), callback_data: `ani:d:${b1.id}` }]);
    }
  }

  if (res.page > 1 || res.hasNextPage) {
    const prevPage = Math.max(1, res.page - 1);
    const nextPage = res.page + 1;
    const navRow = [];
    if (res.page > 1) {
      navRow.push({
        text: '‹ Prev',
        callback_data: `ani:s:${encodeURIComponent(res.query)}:${prevPage}`,
      });
    }
    navRow.push({ text: `Page ${res.page}`, callback_data: 'ani:noop' });
    if (res.hasNextPage) {
      navRow.push({
        text: 'Next ›',
        callback_data: `ani:s:${encodeURIComponent(res.query)}:${nextPage}`,
      });
    }
    rows.push(navRow);
  }

  appendFooterButtons(rows, isGuest, true);
  return { text, keyboard: { inline_keyboard: rows } };
}

const ANICHIN_LATEST_PAGE_SIZE = 10;
const ANICHIN_LATEST_CHUNKS_PER_WEB = 5;

function getLatestReleasesForPage(page, webRes) {
  const targetPage = Math.max(1, page);
  const chunkIndex = (targetPage - 1) % ANICHIN_LATEST_CHUNKS_PER_WEB;
  const offset = chunkIndex * ANICHIN_LATEST_PAGE_SIZE;
  const pageItems = webRes.results.slice(offset, offset + ANICHIN_LATEST_PAGE_SIZE);
  const hasNextPage =
    offset + ANICHIN_LATEST_PAGE_SIZE < webRes.results.length || Boolean(webRes.hasNextPage);
  return {
    page: targetPage,
    hasNextPage,
    results: pageItems,
    startIndex: (targetPage - 1) * ANICHIN_LATEST_PAGE_SIZE,
  };
}

function renderLatestText(res, prefix = '/', isGuest = false) {
  const startIndex = res.startIndex ?? (Math.max(1, res.page) - 1) * ANICHIN_LATEST_PAGE_SIZE;
  const displayItems =
    res.results.length > ANICHIN_LATEST_PAGE_SIZE
      ? res.results.slice(0, ANICHIN_LATEST_PAGE_SIZE)
      : res.results;

  const coverUrl = displayItems[0]?.poster;
  let text = '';
  if (coverUrl) {
    text += `<a href="${coverUrl}">&#8205;</a>`;
  }
  text += `<b>Latest Releases</b> (Page ${res.page})\n\n` + `<b>Recent Episodes:</b>\n`;

  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i];
    const epLabel = item.episode || 'Ep ?';
    text += `${startIndex + i + 1}. <a href="${item.url}">${item.title}</a> [<code>${epLabel}</code>]\n`;
  }
  text += `\n<i>Use <code>${prefix}anichin ep &lt;slug&gt;</code> to get stream & downloads.</i>`;

  const rows = [];
  const topItems = displayItems.slice(0, 4);
  for (let i = 0; i < topItems.length; i += 2) {
    const b1 = topItems[i];
    const b2 = topItems[i + 1];
    if (b1 && b2) {
      rows.push([
        { text: formatButtonTitle(b1.title, 16), callback_data: `ani:e:${b1.id}` },
        { text: formatButtonTitle(b2.title, 16), callback_data: `ani:e:${b2.id}` },
      ]);
    } else if (b1) {
      rows.push([{ text: formatButtonTitle(b1.title, 32), callback_data: `ani:e:${b1.id}` }]);
    }
  }

  const prevPage = Math.max(1, res.page - 1);
  const nextPage = res.page + 1;
  const navRow = [];
  if (res.page > 1) {
    navRow.push({ text: '‹ Prev', callback_data: `ani:l:${prevPage}` });
  }
  if (res.page > 1 || res.hasNextPage) {
    navRow.push({ text: `Page ${res.page}`, callback_data: `ani:noop:${res.page}` });
  }
  if (res.hasNextPage) {
    navRow.push({ text: 'Next ›', callback_data: `ani:l:${nextPage}` });
  }
  if (navRow.length > 0) rows.push(navRow);

  appendFooterButtons(rows, isGuest, true);
  return { text, keyboard: { inline_keyboard: rows } };
}

describe('Deltax App - Anichin Scraper & Extractor Utilities', () => {
  describe('decodeHtmlEntities & cleanHtmlText', () => {
    test('decodes decimal and hex numeric entities correctly', () => {
      assert.equal(
        decodeHtmlEntities('Oriental Martial Academy &#8211; &#x4e1c;&#x5927;'),
        'Oriental Martial Academy – 东大'
      );
      assert.equal(decodeHtmlEntities(''), '');
      assert.equal(decodeHtmlEntities(undefined), '');
    });

    test('decodes common named HTML entities', () => {
      assert.equal(
        decodeHtmlEntities('&lt;b&gt;Tom &amp; Jerry&#39;s &quot;Show&quot;&lt;/b&gt;'),
        '<b>Tom & Jerry\'s "Show"</b>'
      );
    });

    test('cleanHtmlText strips HTML tags and normalizes whitespace', () => {
      const raw =
        '  <div> <h4>Title &#8211; Name</h4> <p>Some   description &amp; info.</p> </div> ';
      assert.equal(cleanHtmlText(raw), 'Title – Name Some description & info.');
      assert.equal(cleanHtmlText(''), '');
    });
  });

  describe('URL helpers', () => {
    test('normalizeAnichinUrl converts relative paths to absolute HTTPS URLs', () => {
      assert.equal(
        normalizeAnichinUrl('/oriental-martial-academy/'),
        'https://anichin.moe/oriental-martial-academy/'
      );
      assert.equal(
        normalizeAnichinUrl('//anichin.moe/wp-content/test.webp'),
        'https://anichin.moe/wp-content/test.webp'
      );
      assert.equal(
        normalizeAnichinUrl('https://anichin.moe/oriental-martial-academy/'),
        'https://anichin.moe/oriental-martial-academy/'
      );
      assert.equal(normalizeAnichinUrl(''), '');
    });

    test('extractAnichinSlug extracts clean slug identifier', () => {
      assert.equal(
        extractAnichinSlug('https://anichin.moe/oriental-martial-academy/'),
        'oriental-martial-academy'
      );
      assert.equal(extractAnichinSlug('/anime/supreme-god-emperor/?ref=1'), 'supreme-god-emperor');
      assert.equal(extractAnichinSlug('oriental-martial-academy'), 'oriental-martial-academy');
      assert.equal(extractAnichinSlug(''), '');
    });

    test('isAnichinUrl validates Anichin domains', () => {
      assert.equal(isAnichinUrl('https://anichin.moe/apotheosis/'), true);
      assert.equal(isAnichinUrl('http://www.anichin.vip/test-episode-1-sub-indo/'), true);
      assert.equal(isAnichinUrl('https://anichin.care/'), true);
      assert.equal(isAnichinUrl('https://youtube.com/watch?v=123'), false);
      assert.equal(isAnichinUrl(''), false);
    });

    test('safeBase64Decode decodes base64 strings safely', () => {
      const encoded = btoa('<iframe src="https://ok.ru/videoembed/12345"></iframe>');
      const decoded = safeBase64Decode(encoded);
      assert.ok(decoded.includes('https://ok.ru/videoembed/12345'));
      assert.equal(safeBase64Decode(''), '');
    });
  });

  describe('HTML Parsers', () => {
    test('parseSearchResultHtml parses search articles and pagination', () => {
      const mockHtml = `
        <div class="listupd">
          <article class="bs" itemscope="itemscope">
            <div class="bsx">
              <a href="/oriental-martial-academy/" itemprop="url" title="Oriental Martial Academy">
                <div class="limit">
                  <div class="typez Donghua">Donghua</div>
                  <div class="bt"><span class="epx">Ongoing</span><span class="sb Sub">Sub</span></div>
                  <img src="/wp-content/uploads/poster1.webp" />
                </div>
                <div class="tt">Oriental Martial Academy<h2 itemprop="headline">Oriental Martial Academy</h2></div>
              </a>
            </div>
          </article>
          <article class="bs" itemscope="itemscope">
            <div class="bsx">
              <a href="/martial-god-asura-season-2/" itemprop="url" title="Martial God Asura Season 2">
                <div class="limit">
                  <div class="status Completed">Completed</div>
                  <div class="typez Donghua">Donghua</div>
                  <div class="bt"><span class="epx">Completed</span><span class="sb Sub">Sub</span></div>
                  <img src="/wp-content/uploads/poster2.webp" />
                </div>
                <div class="tt">Martial God Asura<h2 itemprop="headline">Martial God Asura Season 2</h2></div>
              </a>
            </div>
          </article>
        </div>
        <a class="next page-numbers" href="/page/2/?s=martial">Next »</a>
      `;

      const result = parseSearchResultHtml(mockHtml, 'martial', 1);
      assert.equal(result.query, 'martial');
      assert.equal(result.page, 1);
      assert.equal(result.hasNextPage, true);
      assert.equal(result.results.length, 2);

      assert.equal(result.results[0].id, 'oriental-martial-academy');
      assert.equal(result.results[0].title, 'Oriental Martial Academy');
      assert.equal(result.results[0].url, 'https://anichin.moe/oriental-martial-academy/');
      assert.equal(result.results[0].poster, 'https://anichin.moe/wp-content/uploads/poster1.webp');
      assert.equal(result.results[0].status, 'Ongoing');
      assert.equal(result.results[0].type, 'Donghua');
      assert.equal(result.results[0].sub, 'Sub');

      assert.equal(result.results[1].id, 'martial-god-asura-season-2');
      assert.equal(result.results[1].status, 'Completed');
    });

    test('parseLatestResultHtml extracts latest episodes and series titles', () => {
      const mockHtml = `
        <article class="bs" itemscope="itemscope">
          <div class="bsx">
            <a href="/return-of-the-immortal-emperor-episode-16-subtitle-indonesia/" itemprop="url" title="Return of The Immortal Emperor Episode 16">
              <div class="limit">
                <div class="status Completed">Completed</div>
                <div class="typez Donghua">Donghua</div>
                <div class="bt"><span class="epx">Ep 16</span><span class="sb Sub">Sub</span></div>
                <img src="/wp-content/uploads/thumb.webp" />
              </div>
              <div class="tt">Return of The Immortal Emperor<h2 itemprop="headline">Return of The Immortal Emperor Episode 16 Subtitle Indonesia</h2></div>
            </a>
          </div>
        </article>
      `;

      const result = parseLatestResultHtml(mockHtml, 1);
      assert.equal(result.page, 1);
      assert.equal(result.hasNextPage, false);
      assert.equal(result.results.length, 1);

      const item = result.results[0];
      assert.equal(item.id, 'return-of-the-immortal-emperor-episode-16-subtitle-indonesia');
      assert.equal(item.seriesTitle, 'Return of The Immortal Emperor');
      assert.equal(item.title, 'Return of The Immortal Emperor Episode 16 Subtitle Indonesia');
      assert.equal(item.episode, 'Ep 16');
      assert.equal(item.status, 'Completed');
      assert.equal(item.poster, 'https://anichin.moe/wp-content/uploads/thumb.webp');
    });

    test('parseDetailHtml parses anime metadata, genres, synopsis, and episode list', () => {
      const mockHtml = `
        <h1 class="entry-title">Oriental Martial Academy</h1>
        <div class="thumb"><img src="/wp-content/uploads/cover.webp" /></div>
        <div class="rating-prc"><meta itemprop="ratingValue" content="8.50"></div>
        <div class="entry-content" itemprop="description">
          <h4>Oriental Martial Academy &#8211; 东大高武学院</h4>
          <p>Qin Yu, seorang pemuda jenius.</p>
        </div>
        <div class="spe">
          <span><b>Status:</b> Ongoing</span>
          <span><b>Network:</b> Youku</span>
          <span><b>Studio:</b> Qing Xiang</span>
          <span><b>Tanggal rilis:</b> Jul 16, 2026</span>
          <span><b>Durasi:</b> 20 Min</span>
          <span><b>Season:</b> Summer 2026</span>
          <span><b>Negara:</b> China</span>
          <span><b>Tipe:</b> Donghua</span>
          <span><b>Episode:</b> 26</span>
        </div>
        <div class="genxed">
          <a href="/genres/action/">Action</a>
          <a href="/genres/fantasy/">Fantasy</a>
        </div>
        <div class="eplister">
          <ul>
            <li data-index="0">
              <a href="/oriental-martial-academy-episode-15-subtitle-indonesia/">
                <div class="epl-num">15</div>
                <div class="epl-title">Oriental Martial Academy Episode 15 Sub Indo</div>
                <div class="epl-date">October 22, 2026</div>
              </a>
            </li>
            <li data-index="1">
              <a href="/oriental-martial-academy-episode-14-subtitle-indonesia/">
                <div class="epl-num">14</div>
                <div class="epl-title">Oriental Martial Academy Episode 14 Sub Indo</div>
                <div class="epl-date">October 15, 2026</div>
              </a>
            </li>
          </ul>
        </div>
      `;

      const detail = parseDetailHtml(mockHtml, 'https://anichin.moe/oriental-martial-academy/');
      assert.ok(detail);
      assert.equal(detail.title, 'Oriental Martial Academy');
      assert.equal(detail.altTitle, 'Oriental Martial Academy – 东大高武学院');
      assert.equal(detail.poster, 'https://anichin.moe/wp-content/uploads/cover.webp');
      assert.equal(detail.rating, '8.50');
      assert.equal(detail.synopsis, 'Qin Yu, seorang pemuda jenius.');
      assert.equal(detail.status, 'Ongoing');
      assert.equal(detail.network, 'Youku');
      assert.equal(detail.studio, 'Qing Xiang');
      assert.equal(detail.released, 'Jul 16, 2026');
      assert.equal(detail.duration, '20 Min');
      assert.equal(detail.season, 'Summer 2026');
      assert.equal(detail.country, 'China');
      assert.equal(detail.totalEpisodes, '26');
      assert.deepEqual(detail.genres, ['Action', 'Fantasy']);
      assert.equal(detail.episodes.length, 2);
      assert.equal(detail.episodes[0].number, '15');
      assert.equal(
        detail.episodes[0].url,
        'https://anichin.moe/oriental-martial-academy-episode-15-subtitle-indonesia/'
      );
      assert.equal(detail.episodes[0].date, 'October 22, 2026');
    });

    test('parseEpisodeHtml parses streaming servers, download links, and navigation', () => {
      const server1Iframe = btoa('<iframe src="https://ok.ru/videoembed/12345"></iframe>');
      const server2Iframe = btoa('<iframe src="https://rumble.com/embed/v789"></iframe>');

      const mockHtml = `
        <meta property="og:image" content="/wp-content/uploads/ep15-thumb.webp">
        <h1 class="entry-title">Oriental Martial Academy Episode 15 Subtitle Indonesia</h1>
        <div class="naveps bignav">
          <div class="nvs"><a href="/oriental-martial-academy-episode-14-subtitle-indonesia/" rel="prev">Prev</a></div>
          <div class="nvs nvsc"><a href="/oriental-martial-academy/">Semua Episode</a></div>
        </div>
        <select class="mirror" name="mirror">
          <option value="">Pilih Server Video</option>
          <option value="${server1Iframe}">Okru</option>
          <option value="${server2Iframe}">Rumble</option>
        </select>
        <div class="soraurlx">
          <strong>360p</strong>
          <a href="https://mediafire.com/file1" target="_blank">Mediafire</a>
          <a href="https://terabox.com/file1" target="_blank">Terabox</a>
        </div>
        <div class="soraurlx">
          <strong>720p</strong>
          <a href="https://mediafire.com/file2" target="_blank">Mediafire</a>
        </div>
      `;

      const ep = parseEpisodeHtml(
        mockHtml,
        'https://anichin.moe/oriental-martial-academy-episode-15-subtitle-indonesia/'
      );

      assert.ok(ep);
      assert.equal(ep.title, 'Oriental Martial Academy Episode 15 Subtitle Indonesia');
      assert.equal(ep.poster, 'https://anichin.moe/wp-content/uploads/ep15-thumb.webp');
      assert.equal(ep.series?.title, 'Semua Episode');
      assert.equal(ep.series?.url, 'https://anichin.moe/oriental-martial-academy/');
      assert.equal(
        ep.prevEpisodeUrl,
        'https://anichin.moe/oriental-martial-academy-episode-14-subtitle-indonesia/'
      );
      assert.equal(ep.nextEpisodeUrl, null);

      assert.equal(ep.servers.length, 2);
      assert.equal(ep.servers[0].name, 'Okru');
      assert.equal(ep.servers[0].embedUrl, 'https://ok.ru/videoembed/12345');
      assert.equal(ep.servers[1].name, 'Rumble');
      assert.equal(ep.servers[1].embedUrl, 'https://rumble.com/embed/v789');

      assert.equal(ep.downloads.length, 2);
      assert.equal(ep.downloads[0].quality, '360p');
      assert.equal(ep.downloads[0].links.length, 2);
      assert.equal(ep.downloads[0].links[0].name, 'Mediafire');
      assert.equal(ep.downloads[0].links[0].url, 'https://mediafire.com/file1');
      assert.equal(ep.downloads[1].quality, '720p');
    });

    test('parseScheduleHtml parses days and scheduled anime', () => {
      const mockHtml = `
        <div class="listSchh">
          <h2>Senin</h2>
          <div class="subSchh">
            <a href="/apotheosis/">[SVIP] Apotheosis</a>
            <a href="/swallowed-star/">[SVIP] Swallowed Star</a>
          </div>
        </div>
        <div class="listSchh">
          <h2>Selasa</h2>
          <div class="subSchh">
            <a href="/anime/martial-master/">Martial Master</a>
          </div>
        </div>
      `;

      const days = parseScheduleHtml(mockHtml);
      assert.equal(days.length, 2);
      assert.equal(days[0].day, 'Senin');
      assert.equal(days[0].anime.length, 2);
      assert.equal(days[0].anime[0].title, '[SVIP] Apotheosis');
      assert.equal(days[0].anime[0].url, 'https://anichin.moe/apotheosis/');
      assert.equal(days[1].day, 'Selasa');
      assert.equal(days[1].anime[0].title, 'Martial Master');
    });
  });

  describe('AnichinScraper Class with Mocked Fetch', () => {
    test('search returns empty results on empty query without fetching', async () => {
      let fetchCalled = false;
      const scraper = new AnichinScraper({
        fetchFn: async () => {
          fetchCalled = true;
          return new Response('');
        },
      });

      const res = await scraper.search('   ');
      assert.equal(fetchCalled, false);
      assert.deepEqual(res.results, []);
    });

    test('invokes fetch with proper headers and handles successful response', async () => {
      let interceptedUrl = '';
      let interceptedHeaders = {};

      const mockResponseHtml = `
        <article class="bs"><div class="bsx"><a href="/test/" title="Test Donghua"><div class="tt">Test<h2 itemprop="headline">Test Donghua</h2></div></a></div></article>
      `;

      const scraper = new AnichinScraper({
        fetchFn: async (url, init) => {
          interceptedUrl = String(url);
          interceptedHeaders = init?.headers || {};
          return new Response(mockResponseHtml, { status: 200 });
        },
      });

      const res = await scraper.search('test query', 2);
      assert.equal(interceptedUrl, 'https://anichin.moe/page/2/?s=test%20query');
      assert.ok(interceptedHeaders['User-Agent']);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].title, 'Test Donghua');
    });

    test('handles 404 or network errors gracefully in getDetail and getEpisode', async () => {
      const scraper = new AnichinScraper({
        fetchFn: async () => {
          return new Response('Not Found', { status: 404 });
        },
      });

      const detail = await scraper.getDetail('non-existent');
      assert.equal(detail, null);

      const ep = await scraper.getEpisode('non-existent');
      assert.equal(ep, null);
    });

    test('recovers via token fallback when exact query has typos (e.g. Renegade imortal)', async () => {
      const scraper = new AnichinScraper({
        fetchFn: async (url) => {
          const u = String(url);
          // Exact query returns 0 results
          if (u.includes('Renegade%20imortal')) {
            return new Response('<div class="listupd"></div>', { status: 200 });
          }
          // Word "Renegade" returns results
          if (u.includes('?s=Renegade')) {
            const html = `
              <article class="bs">
                <div class="bsx">
                  <a href="/renegade-immortal/" title="Renegade Immortal">
                    <div class="tt">Renegade Immortal<h2 itemprop="headline">Renegade Immortal</h2></div>
                  </a>
                </div>
              </article>
            `;
            return new Response(html, { status: 200 });
          }
          return new Response('', { status: 200 });
        },
      });

      const res = await scraper.search('Renegade imortal');
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].title, 'Renegade Immortal');
      assert.equal(res.results[0].id, 'renegade-immortal');
    });
  });

  describe('Levenshtein distance & Similarity scoring', () => {
    test('computes distance and detects near matches', () => {
      assert.equal(levenshteinDistance('imortal', 'immortal'), 1);
      assert.equal(levenshteinDistance('renegade', 'renegade'), 0);
      assert.equal(levenshteinDistance('', 'abc'), 3);
    });

    test('scores title similarity with token matching and typo tolerance', () => {
      const score = computeQuerySimilarity('Renegade imortal', 'Renegade Immortal');
      assert.equal(score, 1);
    });
  });

  describe('Anichin Module UI, 2x4 Keyboard & Minimalist Emojis', () => {
    test('ANICHIN_GENRES contains categories including cultivation and action', () => {
      assert.ok(ANICHIN_GENRES.length >= 12);
      assert.ok(ANICHIN_GENRES.some((g) => g.slug === 'cultivation'));
      assert.ok(ANICHIN_GENRES.some((g) => g.slug === 'action'));
    });

    test('buildAnichinMainMenuKeyboard builds a 2x4 layout with category pagination', () => {
      const keyboardGuest = buildAnichinMainMenuKeyboard(1, true);
      assert.equal(keyboardGuest.inline_keyboard.length, 5);

      const keyboard = buildAnichinMainMenuKeyboard(1, false);
      const rows = keyboard.inline_keyboard;

      // 4 rows of 2 buttons each (2x4) + 1 pagination row + 1 close row = 6 rows total
      assert.equal(rows.length, 6);

      // Row 1: Top 2 primary action buttons
      assert.equal(rows[0].length, 2);
      assert.equal(rows[0][0].text, 'New Releases');
      assert.equal(rows[0][0].callback_data, 'ani:l:1');
      assert.equal(rows[0][1].text, 'Schedule');
      assert.equal(rows[0][1].callback_data, 'ani:sched');

      // Rows 2, 3, 4: 2 columns each (total 6 categories)
      assert.equal(rows[1].length, 2);
      assert.equal(rows[2].length, 2);
      assert.equal(rows[3].length, 2);

      // Verify category callback data format
      assert.ok(rows[1][0].callback_data.startsWith('ani:cat:'));
      assert.ok(rows[1][1].callback_data.startsWith('ani:cat:'));

      // Row 5: Pagination controls
      assert.equal(rows[4].length, 3);
      assert.equal(rows[4][0].text, '‹ Prev');
      assert.ok(rows[4][1].text.includes('/'));
      assert.equal(rows[4][2].text, 'Next ›');

      // Row 6: Close button
      assert.equal(rows[5].length, 1);
      assert.equal(rows[5][0].text, 'Close');
      assert.equal(rows[5][0].callback_data, 'ani:close');
    });

    test('renderAnichinMainMenu outputs clean text without emoji clutter', () => {
      const { text } = renderAnichinMainMenu(1, '!');
      assert.ok(text.includes('<b>Anichin Donghua</b>'));
      assert.ok(text.includes('!anichin'));
      // No decorative emoji clutter
      assert.ok(!text.includes('🏮'));
      assert.ok(!text.includes('🎬'));
      assert.ok(!text.includes('🔥'));
    });

    test('buildAnichinScheduleKeyboard outputs day buttons in 2 columns and back button', () => {
      const keyboard = buildAnichinScheduleKeyboard();
      const rows = keyboard.inline_keyboard;

      // 8 days in pairs of 2 = 4 rows, plus 1 row for Back = 5 rows
      assert.equal(rows.length, 5);
      assert.equal(rows[0][0].text, 'Senin');
      assert.equal(rows[0][0].callback_data, 'ani:day:senin:1');
      assert.equal(rows[0][1].text, 'Selasa');
      assert.equal(rows[0][1].callback_data, 'ani:day:selasa:1');

      assert.equal(rows[2][0].text, "Jum'at");
      assert.equal(rows[2][0].callback_data, 'ani:day:jumat:1');

      assert.equal(rows[4][0].text, '‹ Main Menu');
      assert.equal(rows[4][0].callback_data, 'ani:menu:1');
      assert.equal(rows[4][1].text, 'Close');
      assert.equal(rows[4][1].callback_data, 'ani:close');
    });

    test('buildAnichinScheduleKeyboard omits Close button in guest mode', () => {
      const keyboard = buildAnichinScheduleKeyboard(true);
      const rows = keyboard.inline_keyboard;
      assert.equal(rows[4].length, 1);
      assert.equal(rows[4][0].text, '‹ Main Menu');
    });

    test('formatButtonTitle cleans boilerplate and truncates neatly', () => {
      assert.equal(
        formatButtonTitle('Renegade Immortal Subtitle Indonesia', 16),
        'Renegade Immort…'
      );
      assert.equal(formatButtonTitle('Soul Land 2 Sub Indo', 16), 'Soul Land 2');
      assert.equal(formatButtonTitle('Oriental Martial Academy (Donghua)', 16), 'Oriental Martia…');
      assert.equal(formatButtonTitle('Perfect World', 16), 'Perfect World');
    });

    test('normalizeDayKey normalizes day names reliably', () => {
      assert.equal(normalizeDayKey("Jum'at"), 'jumat');
      assert.equal(normalizeDayKey('Senin'), 'senin');
      assert.equal(normalizeDayKey('SELASA'), 'selasa');
      assert.equal(normalizeDayKey('Acak '), 'acak');
    });

    test('renderDayScheduleText displays clean scheduled titles and buttons', () => {
      const mockDay = {
        day: 'Senin',
        anime: [
          {
            id: 'perfect-world',
            title: 'Perfect World',
            url: 'https://anichin.moe/perfect-world/',
          },
        ],
      };
      const { text, keyboard } = renderDayScheduleText(mockDay);
      assert.ok(text.includes('<b>Release Schedule — Senin</b>'));
      assert.ok(text.includes('Perfect World'));
      assert.ok(!text.includes('📅'));

      const rows = keyboard.inline_keyboard;
      assert.ok(rows.some((r) => r.some((b) => b.callback_data === 'ani:sched')));
    });

    test('renderSearchResultsText renders clean text without 🔍 or 💡', () => {
      const mockResult = {
        query: 'renegade',
        page: 1,
        hasNextPage: false,
        results: [
          {
            id: 'renegade-immortal',
            title: 'Renegade Immortal',
            url: 'https://anichin.moe/renegade-immortal/',
            poster: '',
            status: 'Ongoing',
          },
        ],
      };
      const { text } = renderSearchResultsText(mockResult, '!');
      assert.ok(text.includes('<b>Anichin Search:</b> <code>renegade</code>'));
      assert.ok(!text.includes('🔍'));
      assert.ok(!text.includes('💡'));
    });

    test('scraper.getByGenre fetches and parses category page', async () => {
      const scraper = new AnichinScraper({
        fetchFn: async (url) => {
          assert.equal(url, 'https://anichin.moe/genres/cultivation/page/2/');
          return new Response(
            '<article class="bs"><div class="bsx"><a href="/cultivation-1/" title="Cultivation One"></a></div></article>',
            { status: 200 }
          );
        },
      });

      const res = await scraper.getByGenre('cultivation', 2);
      assert.equal(res.query, 'cultivation');
      assert.equal(res.page, 2);
      assert.equal(res.results.length, 1);
      assert.equal(res.results[0].title, 'Cultivation One');
    });

    test('scraper caches results in-memory and serves second request without fetch', async () => {
      let fetchCount = 0;
      const scraper = new AnichinScraper({
        fetchFn: async () => {
          fetchCount++;
          return new Response(
            '<article class="bs"><div class="bsx"><a href="/cached-anime/" title="Cached Anime"></a></div></article>',
            { status: 200 }
          );
        },
      });

      const first = await scraper.search('cached query');
      assert.equal(fetchCount, 1);
      assert.equal(first.results[0].title, 'Cached Anime');

      // Second call should hit the scraper in-memory cache
      const second = await scraper.search('cached query');
      assert.equal(fetchCount, 1);
      assert.equal(second.results[0].title, 'Cached Anime');

      // Clear cache and verify fetch is invoked again
      scraper.clearCache();
      const third = await scraper.search('cached query');
      assert.equal(fetchCount, 2);
      assert.equal(third.results[0].title, 'Cached Anime');
    });

    test('renderSearchResultsText includes pagination when hasNextPage is true', () => {
      const mockResult = {
        query: 'renegade',
        page: 1,
        hasNextPage: true,
        results: [
          {
            id: 'renegade-immortal',
            title: 'Renegade Immortal',
            url: 'https://anichin.moe/renegade-immortal/',
            poster: '',
          },
        ],
      };
      const { keyboard } = renderSearchResultsText(mockResult, '!', false);
      const rows = keyboard.inline_keyboard;
      // Pagination row should have Page 1 and Next ›
      const pageRow = rows.find((r) => r.some((b) => b.text.includes('Page 1')));
      assert.ok(pageRow);
      assert.ok(pageRow.some((b) => b.text === 'Next ›'));

      // Footer row should include Close button in non-guest mode
      const footerRow = rows[rows.length - 1];
      assert.ok(footerRow.some((b) => b.text === 'Close'));
    });

    test('renderDayScheduleText supports multi-page anime and day switcher', () => {
      const mockDay = {
        day: 'Senin',
        anime: Array.from({ length: 12 }, (_, i) => ({
          id: `anime-${i + 1}`,
          title: `Anime Title ${i + 1}`,
          url: `https://anichin.moe/anime-${i + 1}/`,
        })),
      };

      const { text, keyboard } = renderDayScheduleText(mockDay, 'senin', 1, false);
      assert.ok(text.includes('Page 1/2'));

      const rows = keyboard.inline_keyboard;
      // Page row
      const pageRow = rows.find((r) => r.some((b) => b.text.includes('1/2')));
      assert.ok(pageRow);

      // Day switcher row (Senin previous is Minggu/Acak, next is Selasa)
      const dayRow = rows.find((r) => r.some((b) => b.text.includes('Selasa ›')));
      assert.ok(dayRow);

      // Close button
      const closeRow = rows[rows.length - 1];
      assert.ok(closeRow.some((b) => b.text === 'Close'));
    });

    test('getLatestReleasesForPage chunks 49 items into 10-item pages within Telegram limits', () => {
      const mockWebRes = {
        page: 1,
        hasNextPage: true,
        results: Array.from({ length: 49 }, (_, i) => ({
          id: `donghua-ep-${i + 1}`,
          title: `Donghua Episode Title ${i + 1} Subtitle Indonesia`,
          url: `https://anichin.moe/donghua-ep-${i + 1}/`,
          episode: `Ep ${i + 1}`,
        })),
      };

      const page1 = getLatestReleasesForPage(1, mockWebRes);
      assert.equal(page1.results.length, 10);
      assert.equal(page1.results[0].id, 'donghua-ep-1');
      assert.equal(page1.hasNextPage, true);

      const page5 = getLatestReleasesForPage(5, mockWebRes);
      assert.equal(page5.results.length, 9); // items 41 to 49
      assert.equal(page5.results[0].id, 'donghua-ep-41');
      assert.equal(page5.hasNextPage, true);
    });

    test('renderLatestText strictly respects 4096 char limit and includes episode buttons & navigation', () => {
      const mockLatest = {
        page: 1,
        hasNextPage: true,
        results: Array.from({ length: 49 }, (_, i) => ({
          id: `donghua-ep-${i + 1}`,
          title: `Donghua Episode Title ${i + 1} Subtitle Indonesia`,
          url: `https://anichin.moe/donghua-ep-${i + 1}/`,
          episode: `Ep ${i + 1}`,
        })),
      };

      const { text, keyboard } = renderLatestText(mockLatest, '!', false);
      // Message length must remain well below Telegram 4096 character limit
      assert.ok(text.length < 2500, `Text length ${text.length} should be < 2500`);
      assert.ok(text.includes('Page 1'));
      assert.ok(text.includes('Donghua Episode Title 1'));
      // Only 10 items displayed
      assert.ok(text.includes('10. '));
      assert.ok(!text.includes('11. '));

      const rows = keyboard.inline_keyboard;
      // Top episode quick buttons (2 rows x 2 cols = 4 buttons)
      assert.equal(rows[0].length, 2);
      assert.equal(rows[0][0].callback_data, 'ani:e:donghua-ep-1');
      assert.equal(rows[0][1].callback_data, 'ani:e:donghua-ep-2');

      // Pagination row
      const navRow = rows.find((r) => r.some((b) => b.text.includes('Next ›')));
      assert.ok(navRow);
      assert.ok(navRow.some((b) => b.callback_data === 'ani:l:2'));

      // Main menu & Close buttons
      const menuRow = rows.find((r) => r.some((b) => b.text === '‹ Main Menu'));
      assert.ok(menuRow);
      assert.ok(rows[rows.length - 1].some((b) => b.text === 'Close'));
    });

    test('templates exclude blockquotes across menus, schedule, and search views', () => {
      const mainMenu = renderAnichinMainMenu(1, '!', false);
      const schedule = renderDayScheduleText({ day: 'Senin', anime: [] }, 'senin', 1, false);
      const search = renderSearchResultsText(
        { query: 'test', page: 1, hasNextPage: false, results: [] },
        '!',
        false
      );

      // Verify NO blockquotes in any rendered text
      assert.ok(!mainMenu.text.includes('<blockquote'));
      assert.ok(!schedule.text.includes('<blockquote'));
      assert.ok(!search.text.includes('<blockquote'));
    });
  });
});
