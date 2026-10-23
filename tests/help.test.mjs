import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const HELP_GRID_COLS = 2;
const HELP_GRID_ROWS = 3;
const HELP_PAGE_SIZE = HELP_GRID_COLS * HELP_GRID_ROWS; // 6

function filterHelpModules(modules) {
  return modules.filter((m) => m.id.toLowerCase() !== 'help');
}

function buildHelpKeyboard(modules, page = 1, isGuest = false) {
  const filtered = filterHelpModules(modules);
  const sortedModules = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const totalItems = sortedModules.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / HELP_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (currentPage - 1) * HELP_PAGE_SIZE;
  const pageModules = sortedModules.slice(startIndex, startIndex + HELP_PAGE_SIZE);

  const rows = [];
  let currentRow = [];

  for (const mod of pageModules) {
    currentRow.push({
      text: mod.name,
      callback_data: `help:mod:${mod.id}:${currentPage}`,
    });
    if (currentRow.length === HELP_GRID_COLS) {
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
      { text: '‹ Prev', callback_data: `help:page:${prevPage}` },
      {
        text: `${currentPage}/${totalPages}`,
        callback_data: `help:noop:${currentPage}:${totalPages}`,
      },
      { text: 'Next ›', callback_data: `help:page:${nextPage}` },
    ]);
  }

  if (!isGuest) {
    rows.push([{ text: 'Close', callback_data: 'help:close' }]);
  }

  return { inline_keyboard: rows };
}

function renderHelpMainMenu(modules, page = 1, _botUsername = 'deltabot', isGuest = false) {
  const filtered = filterHelpModules(modules);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / HELP_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const pageSuffix = totalPages > 1 ? ` (${currentPage}/${totalPages})` : '';

  const text =
    `<b>Help Menu</b>${pageSuffix}\n\n` +
    `Select a module to view available commands and features.\n\n` +
    `<blockquote expandable>` +
    `<b>Information:</b>\n` +
    `• Tap a module button to see its command syntax.\n` +
    `• Direct lookup: <code>/help &lt;module&gt;</code> (e.g. <code>/help ping</code>).\n` +
    `• Registered Modules: <b>${totalItems}</b>` +
    `</blockquote>`;

  const keyboard = buildHelpKeyboard(filtered, currentPage, isGuest);
  return { text, keyboard };
}

function renderModuleHelp(mod, prefix = '/', returnPage = 1, isGuest = false) {
  let text =
    `<b>${mod.name} Module</b> (<code>v${mod.version || '1.0.0'}</code>)\n` +
    `<i>${mod.description || 'No description provided'}</i>\n\n`;

  const details =
    mod.commandDetails && mod.commandDetails.length > 0
      ? mod.commandDetails
      : (mod.commands || []).map((cmd) => ({ command: cmd, description: '' }));

  if (details.length > 0) {
    const grouped = new Map();
    for (const cmd of details) {
      const desc = cmd.description || '';
      const list = grouped.get(desc) || [];
      const cleanCmd = cmd.command.replace(/^\//, '');
      if (!list.includes(cleanCmd)) {
        list.push(cleanCmd);
      }
      grouped.set(desc, list);
    }

    text += `<b>Commands:</b>\n<blockquote expandable>`;
    for (const [desc, cmds] of grouped.entries()) {
      const formattedCmds = cmds.map((c) => `<code>${prefix}${c}</code>`).join(', ');
      const descPart = desc ? ` — ${desc}` : '';
      text += `• ${formattedCmds}${descPart}\n`;
    }
    text += `</blockquote>`;
  } else {
    text += `<i>This module does not expose any direct prefix commands.</i>`;
  }

  const actionRow = [{ text: '‹ Back', callback_data: `help:page:${returnPage}` }];
  if (!isGuest) {
    actionRow.push({ text: 'Close', callback_data: 'help:close' });
  }

  const keyboard = {
    inline_keyboard: [actionRow],
  };

  return { text, keyboard };
}

describe('Deltax App - Help Module & Interactive Navigation', () => {
  const sampleModules = [
    {
      id: 'ai',
      name: 'AI',
      description: 'Conversational assistant',
      version: '1.0.0',
      commands: ['ai'],
      commandDetails: [{ command: 'ai', description: 'Query Workers AI' }],
    },
    {
      id: 'downloader',
      name: 'Downloader',
      description: 'Social media media downloader',
      version: '1.1.0',
      commands: ['dl', 'download'],
      commandDetails: [
        { command: 'dl', description: 'Download media from URL' },
        { command: 'download', description: 'Download media from URL' },
      ],
    },
    {
      id: 'help',
      name: 'Help',
      description: 'Interactive help menu',
      version: '1.0.0',
      commands: ['help', 'h'],
      commandDetails: [{ command: 'help', description: 'Show help' }],
    },
    {
      id: 'ping',
      name: 'Ping',
      description: 'Latency diagnostics',
      version: '1.0.0',
      commands: ['ping', 'p'],
      commandDetails: [
        { command: 'ping', description: 'Measure roundtrip latency' },
        { command: 'p', description: 'Measure roundtrip latency' },
      ],
    },
  ];

  test('buildHelpKeyboard excludes help module and includes Close button in non-guest mode', () => {
    const keyboard = buildHelpKeyboard(sampleModules, 1, false);
    const rows = keyboard.inline_keyboard;

    assert.equal(rows.length, 3);
    assert.equal(rows[0].length, 2);
    assert.equal(rows[0][0].text, 'AI');
    assert.equal(rows[0][1].text, 'Downloader');

    assert.equal(rows[1].length, 1);
    assert.equal(rows[1][0].text, 'Ping');

    const lastRow = rows[rows.length - 1];
    assert.equal(lastRow.length, 1);
    assert.equal(lastRow[0].text, 'Close');
    assert.equal(lastRow[0].callback_data, 'help:close');
  });

  test('buildHelpKeyboard omits Close button in guest mode', () => {
    const keyboard = buildHelpKeyboard(sampleModules, 1, true);
    const rows = keyboard.inline_keyboard;

    // Should only have module rows, NO Close row
    assert.equal(rows.length, 2);
    const allButtons = rows.flat().map((b) => b.text);
    assert.ok(!allButtons.includes('Close'), 'Close button must be omitted in guest mode');
  });

  test('renderModuleHelp omits Close button in guest mode', () => {
    const downloaderMod = sampleModules[1];
    const { keyboard: regularKb } = renderModuleHelp(downloaderMod, '/', 1, false);
    assert.equal(regularKb.inline_keyboard[0].length, 2);
    assert.equal(regularKb.inline_keyboard[0][1].text, 'Close');

    const { keyboard: guestKb } = renderModuleHelp(downloaderMod, '/', 1, true);
    assert.equal(guestKb.inline_keyboard[0].length, 1);
    assert.equal(guestKb.inline_keyboard[0][0].text, '‹ Back');
  });

  test('buildHelpKeyboard supports 2x3 pagination when non-help modules exceed 6', () => {
    const modules = [
      { id: 'help', name: 'Help', commands: [] },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `mod${i + 1}`,
        name: `Mod ${String(i + 1).padStart(2, '0')}`,
        description: `Description ${i + 1}`,
        version: '1.0.0',
        commands: [`cmd${i + 1}`],
      })),
    ];

    const p1Keyboard = buildHelpKeyboard(modules, 1, false);
    const p1Rows = p1Keyboard.inline_keyboard;

    assert.equal(p1Rows[0].length, HELP_GRID_COLS);
    assert.equal(p1Rows[1].length, HELP_GRID_COLS);
    assert.equal(p1Rows[2].length, HELP_GRID_COLS);

    const p1PaginationRow = p1Rows[3];
    assert.equal(p1PaginationRow.length, 3);
    assert.equal(p1PaginationRow[0].text, '‹ Prev');
    assert.equal(p1PaginationRow[0].callback_data, 'help:page:2');
    assert.equal(p1PaginationRow[1].text, '1/2');
    assert.equal(p1PaginationRow[2].text, 'Next ›');
    assert.equal(p1PaginationRow[2].callback_data, 'help:page:2');

    const p1CloseRow = p1Rows[4];
    assert.equal(p1CloseRow.length, 1);
    assert.equal(p1CloseRow[0].text, 'Close');
  });

  test('renderHelpMainMenu excludes help module from module count and text', () => {
    const { text, keyboard } = renderHelpMainMenu(sampleModules, 1, 'deltabot', false);
    assert.ok(text.includes('<b>Help Menu</b>'));
    assert.ok(
      text.includes('Registered Modules: <b>3</b>'),
      'Should count 3 modules excluding help'
    );
    assert.ok(keyboard.inline_keyboard.length > 0);
  });

  test('StartModule structure has vertical buttons: Catch me and Help', () => {
    const botUsername = 'deltabot';
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Catch me', url: `https://t.me/${botUsername}?startgroup=new` }],
        [{ text: 'Help', callback_data: 'help:main' }],
      ],
    };

    assert.equal(keyboard.inline_keyboard.length, 2);
    assert.equal(keyboard.inline_keyboard[0][0].text, 'Catch me');
    assert.equal(keyboard.inline_keyboard[1][0].text, 'Help');
    assert.equal(keyboard.inline_keyboard[1][0].callback_data, 'help:main');
  });
});
