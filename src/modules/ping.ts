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
        await ctx.api.getMe().catch(() => {});
        const latency = Math.round(performance.now() - start);

        await ctx.respond(html`<b>Pong!</b> <code>${latency}ms</code>`);
      },
      {
        description: 'Check bot latency and roundtrip',
        aliases: ['p'],
      }
    );
  }
}
