import { InlineKeyboard } from 'grammy';
import { BaseModule, PrefixService, type CommandContext } from '../core';
import { escapeHtml } from '../html';
import { isScreenshotRequest, isSetPrefixRequest } from './web';
import { isUnprefixedDownloadCommand } from './downloader';
import type { BotContext } from '../types';
import { findSupportedUrl } from '../extractors';

/**
 * Builds an HTML user mention:
 * - Uses <a href="tg://user?id=...">first_name</a> if first_name exists
 * - Falls back to @username if no first_name
 * - Falls back to <a href="tg://user?id=...">User</a> if no username
 */
function getUserMention(user?: { id?: number; first_name?: string; username?: string }): string {
  if (!user) return 'there';
  if (user.first_name && user.id) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;
  }
  if (user.username) {
    return `@${escapeHtml(user.username)}`;
  }
  if (user.first_name) {
    return escapeHtml(user.first_name);
  }
  if (user.id) {
    return `<a href="tg://user?id=${user.id}">User</a>`;
  }
  return 'there';
}

/**
 * StartModule provides the /start greeting and status for Delta,
 * supporting both regular chat messages and Bot API 10.x Guest Mode.
 */
export class StartModule extends BaseModule {
  readonly id = 'start';
  readonly name = 'Start';
  readonly description = 'Provides Delta welcome greeting and execution status';
  readonly version = '1.0.0';

  public setup(): void {
    // 1. Regular /start command in private/group chat
    this.command(
      ['start'],
      async (ctx: CommandContext) => {
        const mention = getUserMention(ctx.from);
        const botUsername = ctx.me?.username || 'deltaxapp';

        const message =
          `<b>Hey ${mention}!</b>\n\n` +
          `Send a link from <b>Instagram</b>, <b>TikTok</b>, <b>Threads</b>, or <b>X</b> to download media.\n\n` +
          `<blockquote expandable>` +
          `<b>How to use:</b>\n` +
          `• <b>Direct Chat:</b> Send any media link to this chat.\n` +
          `• <b>Group (Guest Mode):</b> Mention the bot in any group without adding it as a member:\n` +
          `<code>@${botUsername} &lt;link&gt;</code>` +
          `</blockquote>\n\n` +
          `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`;

        const keyboard = new InlineKeyboard().url(
          'Catch me',
          `https://t.me/${botUsername}?startgroup=new`
        );

        await ctx.respond(message, {
          reply_markup: keyboard,
        });
      },
      'Start Delta and display greeting'
    );

    // 2. Bot API 10.x Guest Mode (/start or mention without download link)
    this.on('guest_message:text', async (ctx: BotContext) => {
      const text = ctx.msg?.text || '';
      const replyMsg = (ctx.msg as any)?.reply_to_message;

      // STRICT FILTER: If mentioned by reply, SKIP! Never show greeting when mentioned in a reply
      if (replyMsg) {
        return;
      }

      const botUsername = ctx.me?.username || 'deltaxapp';
      const guestPrefix = await PrefixService.getGuestPrefix(ctx.env);

      // If user typed an un-prefixed command (e.g. "@deltaxapp dl <link>"),
      // fall through to show the help greeting so user knows prefix is required
      if (isUnprefixedDownloadCommand(text, guestPrefix)) {
        // Fall through to show greeting
      } else {
        // If a downloader URL is present, let DownloaderModule handle it
        if (findSupportedUrl(text)) {
          return;
        }

        // If a web screenshot or setprefix command is present, let WebModule handle it
        if (
          isScreenshotRequest(text, botUsername, guestPrefix) ||
          isSetPrefixRequest(text, botUsername, guestPrefix)
        ) {
          return;
        }
      }

      const caller = (ctx.msg as any)?.guest_bot_caller_user || ctx.from;
      const callerMention = getUserMention(caller);
      const rawTitleName = caller?.first_name || (caller?.username ? `@${caller.username}` : 'there');

      const keyboard = new InlineKeyboard().url(
        'Catch me',
        `https://t.me/${botUsername}`
      );

      await ctx.answerGuestQuery({
        type: 'article',
        id: `guest_start_${Date.now()}`,
        title: `Hey ${rawTitleName}!`,
        description: `Mention @${botUsername} <link> to download media`,
        input_message_content: {
          message_text:
            `<b>Hey ${callerMention}!</b>\n\n` +
            `<blockquote expandable>` +
            `Send or mention with a media link (Instagram, TikTok, Threads, X) to download.\n\n` +
            `<b>Example:</b>\n` +
            `<code>@${botUsername} &lt;link&gt;</code>` +
            `</blockquote>\n\n` +
            `<blockquote><a href="https://t.me/deltadiscuss">© DeltaxApps</a></blockquote>`,
          parse_mode: 'HTML',
        },
        reply_markup: keyboard,
      });
    });
  }
}
