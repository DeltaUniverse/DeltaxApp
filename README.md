<div align="center">

# Deltax App

**Edge-native, modular Telegram Bot architecture built for Cloudflare Workers.**

[![CI](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml/badge.svg)](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Runtime-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

Deltax App is a serverless runtime architecture for Telegram bots running inside Cloudflare Workers V8 isolates. It refactors traditional persistent bot architectures into an event-driven, single-pass pipeline with deterministic prefix routing, isolated module lifecycles, and non-blocking asynchronous execution.

## Architecture

```
Incoming Webhook (POST)
       │
       ▼
 [Hono HTTP Router] ── (Secret Token Auth)
       │
       ▼
 [GrammY Bot Pipeline]
       │
       ├─► [Context Hydration] (D1, env, executionCtx)
       │
       ├─► [Guest Intent Classifier] (Single-pass classifyGuestMessage)
       │         │
       │         ├── 'reply'        ──► Ignored (in-thread context)
       │         ├── 'command'      ──► Central CommandDispatcher
       │         ├── 'wrong-prefix' ──► Fallback handler
       │         ├── 'url'          ──► Direct media extraction
       │         └── 'none'         ──► Default onboarding
       │
       ├─► [Command Dispatcher] (Strict prefix match & execution)
       │
       └─► [Module Composers] (Decoupled BaseModule event listeners)
                 │
                 └── ExecutionContext.waitUntil() ──► Non-blocking background tasks
```

## Design Principles

### 1. Non-Blocking Edge Concurrency

Webhooks acknowledge Telegram with immediate `200 OK` responses. Heavy operations (I/O, database persistence, external HTTP calls) are offloaded to `ExecutionContext.waitUntil()`, preventing isolate timeouts and eliminating gateway bottlenecks.

### 2. Single-Pass Intent Routing

Guest and inline updates are classified once at the pipeline root via `classifyGuestMessage(ctx, registry, prefix)`. This derives a strongly-typed `ctx.guest` state (`reply`, `command`, `wrong-prefix`, `url`, `none`), removing duplicated regex matching across individual modules.

### 3. Deterministic Prefix Resolution

When a custom prefix (e.g. `!`) is active, all alternative prefixes are rejected prior to execution. This eliminates command ambiguity, duplicate webhook replies, and prefix-collision edge cases.

### 4. Edge State & In-Memory Isolate Caching

Dynamic configuration and collection records are stored in Cloudflare D1. Warm V8 isolates retain an in-memory cache to eliminate repetitive D1 queries across consecutive invocations.

### 5. Zero-Boilerplate Module Lifecycle

Modules inherit from `BaseModule` with isolated composer instances. Build-time scaffolding automatically discovers and registers modules without manual wiring.

```typescript
import { BaseModule, type CommandContext } from './core';
import { html } from './html';

export class PingModule extends BaseModule {
  readonly id = 'ping';
  readonly name = 'Ping';
  readonly description = 'Latency and uptime telemetry';

  public setup(): void {
    this.command(['ping'], async (ctx: CommandContext) => {
      await ctx.respond(html`<b>Pong!</b> Active prefix: <code>${ctx.prefix}</code>`);
    });
  }
}
```

## Repository Structure

```
src/
├── core/                   # Kernel: bot server, dispatcher, prefix & intent routing
│   ├── base_module.ts      # Abstract module class with lifecycle hooks
│   ├── command_dispatcher.ts # Command parser, registry & permission gates
│   ├── database.ts         # Cloudflare D1 ORM & collection abstraction
│   ├── guest_router.ts     # Single-pass intent classification & regex builder
│   ├── module_manager.ts   # Dynamic module loader & Telegram sync
│   ├── prefix_service.ts   # Persistent D1 prefix cache & resolver
│   └── telegram_bot.ts     # Serverless bot server & webhook pipeline
├── modules/                # Plug-and-play module implementations
├── utils/                  # Pure utility helpers (extractors, telegram, formatters)
├── config.ts               # Runtime constants & route configuration
├── html.ts                 # Sanitized template literal tag implementation
├── index.ts                # Worker fetch entrypoint
└── types.ts                # Kernel & context type definitions
```

## Quickstart

```bash
# Clone & install dependencies
git clone git@github.com:DeltaUniverse/DeltaxApp.git
cd DeltaxApp && npm ci

# Run verification suite (format, lint, strict typecheck)
npm run check

# Run unit tests
npm test

# Deploy to Cloudflare Workers
npm run deploy
```

### Module Scaffolding

```bash
# Scaffold a new typed module in src/modules/
npm run make:module telemetry

# Sync module auto-imports
npm run generate:modules
```

## Runtime Configuration

Set environment variables in `.dev.vars` (local) or via Cloudflare Worker Secrets:

| Variable         | Type               | Description                                                 |
| :--------------- | :----------------- | :---------------------------------------------------------- |
| `BOT_TOKEN`      | `string`           | Telegram Bot API token from `@BotFather`                    |
| `WEBHOOK_SECRET` | `string`           | Secret token verified via `X-Telegram-Bot-Api-Secret-Token` |
| `OWNER_ID`       | `string \| number` | Telegram user ID for owner-restricted commands              |
| `ENVIRONMENT`    | `string`           | Runtime tier (`development` \| `production`)                |

Cloudflare D1 binding required in `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "deltaxapp_db",
    "database_id": "<database-id>"
  }
]
```

## License

[MIT](LICENSE) © 2026 Deltax App
