<div align="center">

# Deltax App

**Edge-native, modular Telegram Bot architecture built for Cloudflare Workers.**

[![CI](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml/badge.svg)](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/codeql.yml/badge.svg)](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![grammY](https://img.shields.io/badge/grammY-248AEC?logo=telegram&logoColor=white)](https://grammy.dev/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)

</div>

---

## Overview

Deltax App is an asynchronous Telegram Bot framework engineered specifically for serverless edge runtimes. By combining [Hono](https://hono.dev/) HTTP routing with [grammY](https://grammy.dev/) and Cloudflare D1, it delivers deterministic command dispatching, isolated module lifecycles, and sub-15ms global cold starts.

The core architecture adapts the modular dispatch principles pioneered by [Caligo](https://github.com/TeamDelta/Caligo), refactored into a single-client, edge-native execution model.

---

## Core Features & Modules

| Module         | Identifier   | Commands                    | Description                                                                                                                                                                        |
| :------------- | :----------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Downloader** | `downloader` | `/dl`, `/download`          | Multi-platform guest & direct downloader for Instagram (Reels, Posts, Carousels), TikTok (Videos, Photo slides), and X/Twitter (Videos, GIFs, Photos) with native album groupings. |
| **Web**        | `web`        | `/ss`, `/web`, `/setprefix` | Website screenshot generator via Linkdr engine with fallbacks, plus dynamic prefix configuration stored in D1.                                                                     |
| **Wallpaper**  | `wallpaper`  | `/wallpaper`, `/bing`       | Daily Bing UHD/4K wallpaper delivery with locale/market resolution and argument parsing.                                                                                           |
| **Start**      | `start`      | `/start`                    | Welcome onboarding, service status, and context-aware guest query handling.                                                                                                        |

---

## Architectural Highlights

### Deterministic Command Dispatching & Dynamic Prefixing

A centralized pre-flight interceptor enforces strict prefix resolution. When a custom prefix (e.g. `!`) is configured in Cloudflare D1, all non-matching prefixes are rejected from command execution, eliminating ambiguity and duplicate webhook executions.

### Unified Guest-Message Intent Routing

Guest and inline updates are classified by a single-pass middleware into typed context states (`ctx.guest`), removing duplicated regex matching across individual modules:

- `{ kind: 'reply' }`: Safely ignores mentions inside reply threads without spurious responses.
- `{ kind: 'command'; name; args }`: Routes strictly prefixed commands to their handlers.
- `{ kind: 'wrong-prefix'; name }`: Gracefully triggers fallback help without executing wrong-prefix actions.
- `{ kind: 'url'; url; platform }`: Automatically downloads recognized media URLs from direct or mentioned messages.
- `{ kind: 'none' }`: Fallback state for generic interactions and onboarding greetings.

### Automatic Module Discovery & Hot Compilation

Features are self-contained classes extending `BaseModule`. Dropping a module file into `src/modules/` automatically registers its commands, metadata, and event composers via build-time scripts without manual wiring.

### Non-Blocking Edge Concurrency

Incoming Telegram webhooks respond with `200 OK` instantaneously. Heavy tasks—including media extraction, external screenshot rendering, and database transactions—are scheduled non-blockingly using Cloudflare's `ExecutionContext.waitUntil()`.

### Distributed Persistence Layer

Global runtime settings (e.g., active bot and guest command prefixes) and structured document collections are backed by Cloudflare D1, accelerated by an in-memory caching layer across warm V8 isolates.

### Tagged Template Entity Sanitization

Built-in `html` tagged template literals iteratively sanitize dynamic inputs and prevent Telegram HTML parse errors:

```typescript
import { html, escapeHtml } from './html';

const message = html`<b>Hello ${escapeHtml(userName)}!</b>`;
```

---

## Module Development

Creating a new module is simple:

```typescript
import { BaseModule, type CommandContext } from './core';
import { html } from './html';

export class StatusModule extends BaseModule {
  readonly id = 'status';
  readonly name = 'Status';
  readonly description = 'Health and latency metrics';

  public setup(): void {
    this.command(
      ['status', 'health'],
      async (ctx: CommandContext) => {
        await ctx.respond(
          html`<b>Deltax App:</b> Operational. Active Prefix: <code>${ctx.prefix}</code>`
        );
      },
      { description: 'Display service health', usage: '' }
    );
  }
}
```

---

## CLI & Developer Tooling

Scaffold a new module with automatic file generation and registry indexing:

```bash
# Generate a new module skeleton
npm run make:module weather

# Regenerate module index
npm run generate:modules

# Watch modules directory during development
npm run watch:modules
```

---

## Getting Started

### Prerequisites

- Node.js `>= 22.0.0`
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- A Cloudflare account with Workers & D1 enabled

### Installation

```bash
# Clone the repository
git clone git@github.com:DeltaUniverse/DeltaxApp.git
cd DeltaxApp

# Install dependencies
npm ci
```

### Configuration

Create a `.dev.vars` file for local development:

```ini
BOT_TOKEN="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
WEBHOOK_SECRET="your-secure-webhook-secret"
OWNER_ID="7492470603"
ENVIRONMENT="development"
```

Configure your D1 database binding in `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "deltaxapp_db",
    "database_id": "your-d1-database-uuid"
  }
]
```

### Verification & Testing

```bash
# Format check, lint, and strict type check
npm run check

# Run the complete test suite
npm test
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

---

## Webhook Endpoints

Once deployed, the worker exposes the following HTTP endpoints:

- `GET /health` or `GET /`: Health check inspection returning bot info, edge colo, uptime, and active modules.
- `POST /` (or configured webhook path): Webhook update ingestion protected by `X-Telegram-Bot-Api-Secret-Token`.
- `GET /setWebhook`: Registers webhook URL and secret with Telegram API and synchronizes registered bot commands.
- `GET /getWebhookInfo`: Retrieves live webhook diagnostic details from Telegram.
- `GET /deleteWebhook`: Deregisters the active webhook.

---

## Acknowledgements

- Built with [grammY](https://grammy.dev/) and [Hono](https://hono.dev/).
- Command dispatch architecture inspired by [Caligo](https://github.com/TeamDelta/Caligo).

---

## License

[MIT](LICENSE) © 2026 Deltax App
