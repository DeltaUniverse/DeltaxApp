import { InlineKeyboard } from 'grammy';
import { BaseModule, PrefixService, type CommandContext } from '../core';
import { isScreenshotRequest, isSetPrefixRequest } from './web';
import { isUnprefixedDownloadCommand } from './downloader';
import type { BotContext } from '../types';
import { getUserMention, getCallerUser, findSupportedUrl } from '../utils';

/**
 * StartModule provides the /start greeting and status for Delta,
 * supporting regular chat messages.
 */
export class StartModule extends BaseModule {
  readonly id = 'start';
  readonly name = 'Start';
  readonly description = 'Provides Delta welcome greeting and execution status';
  readonly version = '1.0.0';

  public setup(): void {
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
          `• <b>Group Mention:</b> Mention the bot in any group:\n` +
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

    this.on('guest_message:text', async (ctx: BotContext) => {
      const text = ctx.msg?.text || '';
      const replyMsg = ctx.msg?.reply_to_message;

      // Avoid showing greeting when the bot is referenced inside a reply thread.
      if (replyMsg) {
        return;
      }

      const botUsername = ctx.me?.username || 'deltaxapp';
      const guestPrefix = await PrefixService.getGuestPrefix(ctx.env);

      if (!isUnprefixedDownloadCommand(text, guestPrefix)) {
        if (findSupportedUrl(text)) {
          return;
        }

        if (
          isScreenshotRequest(text, botUsername, guestPrefix) ||
          isSetPrefixRequest(text, botUsername, guestPrefix)
        ) {
          return;
        }
      }

      const caller = getCallerUser(ctx);
      const callerMention = getUserMention(caller);
      const rawTitleName =
        caller?.first_name || (caller?.username ? `@${caller.username}` : 'there');

      const keyboard = new InlineKeyboard().url('Catch me', `https://t.me/${botUsername}`);

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
