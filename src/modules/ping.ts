import { BaseModule, type CommandContext } from '../core';
import { html } from '../html';

export class PingModule extends BaseModule {
  readonly id = 'ping';
  readonly name = 'Ping';
  readonly description = 'Latency and roundtrip telemetry';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['ping', 'p'],
      async (ctx: CommandContext) => {
        const start = performance.now();
        const sent = (await ctx.respond(html`<b>Pinging...</b>`)) as
          | { inline_message_id?: string; message_id?: number; chat?: { id?: number | string } }
          | undefined;

        const latency = Math.round(performance.now() - start);
        const pongText = html`<b>Pong!</b> <code>${latency}ms</code>`;

        if (!sent) return;

        if (sent.inline_message_id) {
          await ctx.api
            .editMessageTextInline(sent.inline_message_id, pongText, { parse_mode: 'HTML' })
            .catch((err) => console.error('[PingModule] editMessageTextInline error:', err));
        } else if (sent.message_id) {
          const chatId = sent.chat?.id || ctx.chat?.id || ctx.msg?.chat?.id;
          if (chatId) {
            await ctx.api
              .editMessageText(chatId, sent.message_id, pongText, { parse_mode: 'HTML' })
              .catch((err) => console.error('[PingModule] editMessageText error:', err));
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
