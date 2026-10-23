import { InlineKeyboard } from 'grammy';
import { BaseModule, type CommandContext } from '../core';
import type { BotContext } from '../types';
import { getUserMention, getCallerUser } from '../utils';

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
          `Welcome to <b>Delta</b> — modular serverless Telegram bot powered by Cloudflare Workers.\n\n` +
          `<blockquote expandable>` +
          `<b>Core Capabilities:</b>\n` +
          `• <b>AI:</b> Conversational assistance and queries\n` +
          `• <b>Downloader:</b> Instagram, TikTok, Threads, and X\n` +
          `• <b>Web:</b> High-resolution page screenshots\n` +
          `• <b>Wallpaper:</b> Ultra HD Bing photography\n` +
          `• <b>Diagnostics:</b> Latency telemetry and health checks\n\n` +
          `<b>Usage:</b>\n` +
          `• Direct Chat: Send a media link or command directly.\n` +
          `• Group Chat: Mention <code>@${botUsername} &lt;command/link&gt;</code>.\n` +
          `• Tap <b>Help</b> below to inspect module commands.` +
          `</blockquote>`;

        const keyboard = new InlineKeyboard()
          .url('Catch me', `https://t.me/${botUsername}?startgroup=new`)
          .row()
          .text('Help', 'help:main');

        await ctx.respond(message, {
          reply_markup: keyboard,
        });
      },
      'Start Delta and display greeting'
    );

    this.on('guest_message:text', async (ctx: BotContext) => {
      if (
        ctx.guest?.kind === 'reply' ||
        ctx.guest?.kind === 'url' ||
        ctx.guest?.kind === 'command'
      ) {
        return;
      }

      const botUsername = ctx.me?.username || 'deltaxapp';
      const caller = getCallerUser(ctx);
      const callerMention = getUserMention(caller);
      const rawTitleName =
        caller?.first_name || (caller?.username ? `@${caller.username}` : 'there');

      const keyboard = new InlineKeyboard()
        .url('Catch me', `https://t.me/${botUsername}`)
        .row()
        .text('Help', 'help:main');

      await ctx.answerGuestQuery({
        type: 'article',
        id: `guest_start_${Date.now()}`,
        title: `Hey ${rawTitleName}!`,
        description: `Delta — Serverless Telegram Bot`,
        input_message_content: {
          message_text:
            `<b>Hey ${callerMention}!</b>\n\n` +
            `Welcome to <b>Delta</b> — modular serverless assistant.\n\n` +
            `<blockquote expandable>` +
            `<b>Capabilities:</b> AI, Media Downloader, Web Screenshots, Wallpapers, and Diagnostics.\n\n` +
            `<b>Usage:</b>\n` +
            `Mention <code>@${botUsername} &lt;command/link&gt;</code> in any chat or explore commands with <code>@${botUsername} /help</code>.` +
            `</blockquote>`,
          parse_mode: 'HTML',
        },
        reply_markup: keyboard,
      });
    });
  }
}
