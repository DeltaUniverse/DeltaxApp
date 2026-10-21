# Deltax App

Deltax App is a lightweight, high-performance Telegram bot engineered for Cloudflare Workers edge runtime. Powered by Hono and grammY, its core architecture is inspired by Caligo's modular command dispatcher pattern, redesigned for modern serverless environments.

---

## Highlights

- **Single-Client Command Dispatcher**: Centralized pre-flight command router supporting dynamic prefixing (`/`, `!`), alias mapping, and owner-only authorization.
- **Caligo-Inspired Modular Design**: Self-contained OOP modules inheriting from `BaseModule` with automatic discovery and zero manual wiring.
- **Strict Event Filtering**: Pre-filters text commands to eliminate double execution and suppresses accidental triggers when mentioned by reply.
- **Edge-Native & Serverless**: Sub-15ms cold starts on Cloudflare Workers edge network using Hono HTTP routing.
- **D1 Persistent State**: Dynamic prefix configuration and bot settings persisted across edge isolates via Cloudflare D1.
- **Non-Blocking Concurrency**: Webhook updates return `200 OK` instantaneously while heavy async jobs (media extraction, screenshots) run in the background via `ctx.waitUntil`.
- **Type-Safe HTML**: Built-in tagged template literals with automatic entity escaping to guarantee crash-proof Telegram HTML rendering.

---

## Module Example

Adding a new feature is as simple as defining a class:

```typescript
import { BaseModule, type CommandContext } from './core';
import { html } from './html';

export class PingModule extends BaseModule {
  readonly id = 'ping';
  readonly name = 'Ping';
  readonly description = 'Latency and status check';

  public setup(): void {
    this.command(
      ['ping', 'p'],
      async (ctx: CommandContext) => {
        await ctx.respond(html`<b>Pong!</b> Active prefix: <code>${ctx.prefix}</code>`);
      },
      { description: 'Check bot latency' }
    );
  }
}
```

Modules placed in `src/modules/` are automatically discovered and registered on build.

---

## Commands

| Command | Arguments | Description |
|---|---|---|
| `/start` | None | Welcome banner and status |
| `/dl` | `<url>` | Download media from Instagram, TikTok, or X (Twitter) |
| `/ss` | `<url>` | Capture a high-resolution website screenshot |
| `/setprefix` | `<prefix>` | Change the active command prefix (Owner only) |

---

## Development

```bash
# Install dependencies
npm install

# Run test suite
npm test

# Type-check TypeScript
npm run typecheck

# Deploy to Cloudflare Workers
npm run deploy
```

---

## Acknowledgements

- Built with [grammY](https://grammy.dev/) and [Hono](https://hono.dev/).
- Core modular architecture and command dispatching patterns inspired by [Caligo](https://github.com/TeamDelta/Caligo).

---

## License

[MIT](LICENSE) © 2026 Deltax App
