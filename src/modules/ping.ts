import { BaseModule, type CommandContext } from '../core';
import { html } from '../html';
import { logger } from '../utils';

/**
 * PingModule measures roundtrip latency to the Telegram Bot API.
 * Registers /ping and /p commands.
 */
export class PingModule extends BaseModule {
  readonly id = 'ping';
  readonly name = 'Ping';
  readonly description = 'Latency and roundtrip telemetry';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['ping', 'p'],
      async (ctx: CommandContext) => {
        const sent = (await ctx.respond(html`<b>Pinging...</b>`)) as
          | { inline_message_id?: string; message_id?: number; chat?: { id?: number | string } }
          | undefined;

        if (!sent) return;

        // Measure pure API roundtrip over the established warm connection
        const start = performance.now();
        await ctx.api.getMe().catch(() => {});
        const latency = Math.round(performance.now() - start);

        const pongText = html`<b>Pong!</b> <code>${latency}ms</code>`;

        if (sent.inline_message_id) {
          await ctx.api
            .editMessageTextInline(sent.inline_message_id, pongText, { parse_mode: 'HTML' })
            .catch((err) => logger.error({ err }, 'failed to edit inline message text'));
        } else if (sent.message_id) {
          const chatId = sent.chat?.id || ctx.chat?.id || ctx.msg?.chat?.id;
          if (chatId) {
            await ctx.api
              .editMessageText(chatId, sent.message_id, pongText, { parse_mode: 'HTML' })
              .catch((err) => logger.error({ err }, 'failed to edit message text'));
          }
        }
      },
      {
        description: 'Check bot latency and roundtrip',
        aliases: ['p'],
      }
    );
  }
}
