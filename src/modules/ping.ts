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
          { message_id?: number } | undefined;
        const latency = Math.round(performance.now() - start);

        if (sent?.message_id && ctx.chat?.id) {
          try {
            await ctx.api.editMessageText(
              ctx.chat.id,
              sent.message_id,
              html`<b>Pong!</b> <code>${latency}ms</code>`,
              { parse_mode: 'HTML' }
            );
          } catch {
            // Safe fallback if edit is not permitted
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
