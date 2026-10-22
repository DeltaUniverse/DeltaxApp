<div align="center">

# Deltax App

**Edge-native, modular Telegram Bot architecture built for Cloudflare Workers.**

[![CI](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml/badge.svg)](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/codeql.yml/badge.svg)](https://github.com/DeltaUniverse/DeltaxApp/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)

</div>

---

## Overview

Deltax App is an asynchronous Telegram Bot framework engineered specifically for serverless edge runtimes. By combining [Hono](https://hono.dev/) HTTP routing with [grammY](https://grammy.dev/) and Cloudflare D1, it delivers deterministic command dispatching, isolated module lifecycles, and sub-15ms global cold starts.

The core architecture adopts the modular dispatch principles pioneered by [Caligo](https://github.com/TeamDelta/Caligo), refactored into a single-client, edge-native execution model.

---

## Architecture & Principles

### Deterministic Command Dispatching

A centralized pre-flight interceptor enforces strict prefix resolution. When a custom prefix (e.g. `!`) is active, all foreign prefixes are rejected, eliminating execution ambiguity and duplicate webhook replies.

### Modular Encapsulation

Features are developed as self-contained classes inheriting from `BaseModule`. New modules placed in `src/modules/` are automatically discovered, compiled, and registered without manual wiring or registry updates.

### Non-Blocking Edge Concurrency

Incoming Telegram webhooks respond with `200 OK` instantaneously. Intensive operations—including remote media extraction, screenshot rendering, and database transactions—are scheduled non-blockingly using Cloudflare's `ExecutionContext.waitUntil()`.

### Distributed Persistence Layer

Dynamic runtime configurations and collection data are persisted across edge regions using Cloudflare D1. An in-memory cache layer avoids redundant network round-trips on warm isolates.

### Type-Safe Presentation

Out-of-the-box integration with tagged template literals (`html`...``) guarantees entity sanitization and prevents Telegram parse errors caused by unescaped dynamic input.

---

## Module Extension

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
      { description: 'Display service health' }
    );
  }
}
```

---

## Getting Started

```bash
# Clone the repository
git clone git@github.com:DeltaUniverse/DeltaxApp.git
cd DeltaxApp

# Install dependencies
npm ci

# Validate types and run test suite
npm run typecheck
npm test

# Deploy to Cloudflare Workers
npm run deploy
```

---

## Acknowledgements

- Built with [grammY](https://grammy.dev/) and [Hono](https://hono.dev/).
- Command dispatch architecture inspired by [Caligo](https://github.com/TeamDelta/Caligo).

---

## License

[MIT](LICENSE) © 2026 Deltax App
