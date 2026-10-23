/**
 * Copyright (c) 2026 Deltax App
 * Licensed under the MIT License.
 * See LICENSE in the project root for license information.
 */

import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext, PrefixService } from '../core';
import type { BotContext, ModuleInfo } from '../types';
import { escapeHtml } from '../html';
import { isGuestMode, logger } from '../utils';

export const HELP_GRID_COLS = 2;
export const HELP_GRID_ROWS = 3;
export const HELP_PAGE_SIZE = HELP_GRID_COLS * HELP_GRID_ROWS; // 6 items (2x3 grid)

/**
 * Filters out internal help module from the public module list.
 */
export function filterHelpModules(modules: ModuleInfo[]): ModuleInfo[] {
  return modules.filter((m) => m.id.toLowerCase() !== 'help');
}

/**
 * Builds a clean, minimalistic 2x3 inline keyboard with pagination and conditional close button.
 */
export function buildHelpKeyboard(
  modules: ModuleInfo[],
  page = 1,
  isGuest = false
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const filtered = filterHelpModules(modules);
  const sortedModules = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const totalItems = sortedModules.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / HELP_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (currentPage - 1) * HELP_PAGE_SIZE;
  const pageModules = sortedModules.slice(startIndex, startIndex + HELP_PAGE_SIZE);

  let col = 0;
  for (const mod of pageModules) {
    keyboard.text(mod.name, `help:mod:${mod.id}:${currentPage}`);
    col++;
    if (col === HELP_GRID_COLS) {
      keyboard.row();
      col = 0;
    }
  }

  if (col > 0) {
    keyboard.row();
  }

  if (totalPages > 1) {
    const prevPage = currentPage > 1 ? currentPage - 1 : totalPages;
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1;
    keyboard
      .text('‹ Prev', `help:page:${prevPage}`)
      .text(`${currentPage}/${totalPages}`, `help:noop:${currentPage}:${totalPages}`)
      .text('Next ›', `help:page:${nextPage}`)
      .row();
  }

  // Omit close button in guest mode (inline query) where deleteMessage is unavailable
  if (!isGuest) {
    keyboard.text('Close', 'help:close');
  }

  return keyboard;
}

/**
 * Formats the clean main help menu message and keyboard.
 */
export function renderHelpMainMenu(
  modules: ModuleInfo[],
  page = 1,
  _botUsername = 'deltaxapp',
  isGuest = false
): { text: string; keyboard: InlineKeyboard } {
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

/**
 * Formats a clean module detail help view.
 */
export function renderModuleHelp(
  mod: ModuleInfo,
  prefix = '/',
  returnPage = 1,
  isGuest = false
): { text: string; keyboard: InlineKeyboard } {
  let text =
    `<b>${mod.name} Module</b> (<code>v${mod.version || '1.0.0'}</code>)\n` +
    `<i>${mod.description || 'No description provided'}</i>\n\n`;

  const details =
    mod.commandDetails && mod.commandDetails.length > 0
      ? mod.commandDetails
      : (mod.commands || []).map((cmd) => ({ command: cmd, description: '' }));

  if (details.length > 0) {
    const grouped = new Map<string, string[]>();
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

  const keyboard = new InlineKeyboard().text('‹ Back', `help:page:${returnPage}`);
  if (!isGuest) {
    keyboard.text('Close', 'help:close');
  }

  return { text, keyboard };
}

/**
 * HelpModule provides automatic module-based interactive help menus with
 * clean 2x3 grid pagination and callback navigation.
 */
export class HelpModule extends BaseModule {
  readonly id = 'help';
  readonly name = 'Help';
  readonly description = 'Interactive help menu and module command explorer';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['help', 'h'],
      async (ctx: CommandContext) => {
        const isGuest = Boolean(ctx.isGuest || isGuestMode(ctx));
        const arg = ctx.args[0]?.toLowerCase().trim();
        const rawModules =
          ctx.modules && ctx.modules.length > 0 ? ctx.modules : this.getFallbackModules();
        const botUsername = ctx.me?.username || 'deltaxapp';
        const prefix = ctx.prefix || '/';

        if (arg) {
          const mod = rawModules.find(
            (m) =>
              m.id.toLowerCase() === arg ||
              m.name.toLowerCase() === arg ||
              (m.commands && m.commands.some((c) => c.toLowerCase().replace(/^\//, '') === arg))
          );

          if (mod) {
            const { text, keyboard } = renderModuleHelp(mod, prefix, 1, isGuest);
            await ctx.respond(text, { reply_markup: keyboard });
            return;
          }

          const { text, keyboard } = renderHelpMainMenu(rawModules, 1, botUsername, isGuest);
          const notFoundText = `<i>Module or command "<b>${escapeHtml(arg)}</b>" not found.</i>\n\n${text}`;
          await ctx.respond(notFoundText, { reply_markup: keyboard });
          return;
        }

        const { text, keyboard } = renderHelpMainMenu(rawModules, 1, botUsername, isGuest);
        await ctx.respond(text, { reply_markup: keyboard });
      },
      {
        description: 'Display interactive help menu and commands',
        usage: '[module]',
        aliases: ['h'],
      }
    );

    // Concurrently answer callback queries for all help navigation buttons in parallel via fork
    this.callbackQuery(/^help:(?!noop)/).fork(async (ctx: BotContext) => {
      await ctx.answerCallbackQuery().catch(() => {});
    });

    // Concurrently answer page indicator toasts via fork
    this.callbackQuery(/^help:noop(?::(\d+):(\d+))?$/).fork(async (ctx: BotContext) => {
      const match = ctx.callbackQuery?.data?.match(/^help:noop(?::(\d+):(\d+))?$/);
      const text = match?.[1] && match?.[2] ? `Page ${match[1]} of ${match[2]}` : 'Current Page';
      await ctx.answerCallbackQuery({ text }).catch(() => {});
    });

    this.callbackQuery(/^help:(main|page:(\d+))$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const data = ctx.callbackQuery?.data || '';
      let targetPage = 1;
      const pageMatch = data.match(/^help:page:(\d+)$/);
      if (pageMatch) {
        targetPage = parseInt(pageMatch[1], 10) || 1;
      }

      const modules =
        ctx.modules && ctx.modules.length > 0 ? ctx.modules : this.getFallbackModules();
      const botUsername = ctx.me?.username || 'deltaxapp';
      const { text, keyboard } = renderHelpMainMenu(modules, targetPage, botUsername, isGuest);

      await ctx
        .editMessageText(text, {
          reply_markup: keyboard,
          parse_mode: 'HTML',
        })
        .catch((err) => {
          if (!String(err).includes('message is not modified')) {
            logger.error({ err }, 'failed to edit help main menu');
          }
        });
    });

    this.callbackQuery(/^help:mod:([^:]+)(?::(\d+))?$/, async (ctx: BotContext) => {
      const isGuest = Boolean(ctx.callbackQuery?.inline_message_id || isGuestMode(ctx));
      const match = ctx.callbackQuery?.data?.match(/^help:mod:([^:]+)(?::(\d+))?$/);
      const modId = match?.[1]?.toLowerCase().trim();
      const returnPage = match?.[2] ? parseInt(match[2], 10) || 1 : 1;

      const modules =
        ctx.modules && ctx.modules.length > 0 ? ctx.modules : this.getFallbackModules();
      const mod = modules.find((m) => m.id.toLowerCase() === modId);

      if (!mod) {
        await ctx
          .answerCallbackQuery({ text: 'Module not found', show_alert: true })
          .catch(() => {});
        return;
      }

      const activePrefix = await PrefixService.getBotPrefix(ctx.env);
      const { text, keyboard } = renderModuleHelp(mod, activePrefix, returnPage, isGuest);

      await ctx
        .editMessageText(text, {
          reply_markup: keyboard,
          parse_mode: 'HTML',
        })
        .catch((err) => {
          if (!String(err).includes('message is not modified')) {
            logger.error({ err }, 'failed to edit module help');
          }
        });
    });

    this.callbackQuery('help:close', async (ctx: BotContext) => {
      if (ctx.chatId && ctx.msg?.message_id) {
        await ctx.deleteMessage().catch((err) => {
          logger.warn({ err }, 'failed to delete help message');
        });
        return;
      }

      // Fallback for inline messages (Telegram Bot API does not support deleting inline messages)
      await ctx
        .editMessageText('<i>Help closed.</i>', {
          parse_mode: 'HTML',
          reply_markup: undefined,
        })
        .catch(() => {});
    });
  }

  private getFallbackModules(): ModuleInfo[] {
    return [
      {
        id: 'ping',
        name: 'Ping',
        description: 'Latency diagnostics',
        version: '1.0.0',
        commands: ['ping', 'p'],
        commandDetails: [{ command: 'ping', description: 'Measure roundtrip latency' }],
      },
    ];
  }
}
