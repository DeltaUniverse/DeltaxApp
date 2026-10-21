# Deltax App

A production-grade, modular, non-blocking asynchronous Telegram Bot engineered for serverless deployment on [Cloudflare Workers](https://workers.cloudflare.com/) using [Hono](https://hono.dev/), [grammY](https://grammy.dev/), and Cloudflare D1.

---

## Architecture Highlights

- **Serverless and Global**: Running on Cloudflare's worldwide V8 edge network with Hono HTTP routing.
- **Single Client Architecture**: Clean single-client event dispatcher and command interceptor.
- **Strict Command & Prefix Dispatcher**: Centralized pre-flight command parser supporting dynamic bot/guest prefixes (`/`, `!`), owner-only permissions, and alias mapping.
- **Defensive Event Handling**: Skip ambiguous replies without explicit commands, preventing unwanted replies.
- **Fully Object-Oriented Modules**: Every feature module is an encapsulated class inheriting from [`BaseModule`](src/core/base_module.ts).
- **Auto-Imported Modules**: Modules placed in `src/modules/**/*.ts` are automatically discovered, registered, and mounted without manually modifying index files.
- **Clean Flat Structure**: Direct top-level imports (`src/types.ts`, `src/config.ts`, `src/html.ts`, `src/extractors/`) with standard snake_case naming.
- **Type-Safe HTML Formatting**: Native integration with `@grammyjs/parse-mode` and custom `html` tagged template literals ensuring zero double-escaping and crash-proof Telegram HTML rendering.
- **Non-blocking Execution**: Powered by Cloudflare's `ExecutionContext.waitUntil()`. Webhooks respond immediately with `200 OK`, while async media fetching and background tasks run non-blockingly.

---

## Project Structure

```text
deltax-app/
├── wrangler.jsonc             # Cloudflare Workers configuration
├── package.json               # Dependencies, build scripts & dev tooling
├── tsconfig.json              # TypeScript configuration
├── LICENSE                    # MIT License
├── .dev.vars.example          # Local environment variables template
├── scripts/
│   ├── auto_import.mjs        # Recursive auto-discovery generator for src/modules/
│   └── create_module.mjs      # Module scaffolding CLI (npm run make:module)
├── src/
│   ├── index.ts               # Hono edge router & Cloudflare Worker entrypoint
│   ├── config.ts              # Route endpoints, HTTP headers, bot metadata
│   ├── html.ts                # Type-safe HTML escaping, tagged template literal & parse-mode
│   ├── types.ts               # Centralized TypeScript definitions
│   ├── core/                  # Core bot architecture & dispatch engine
│   │   ├── base_module.ts     # Abstract OOP BaseModule class with grammY composer
│   │   ├── command_dispatcher.ts # Centralized prefix and command parser
│   │   ├── module_manager.ts  # Defensive module registry & command sync
│   │   ├── prefix_service.ts  # D1-backed dynamic prefix management & owner checks
│   │   ├── telegram_bot.ts    # Main server class handling webhook requests & errors
│   │   └── index.ts           # Core barrel export
│   ├── extractors/            # Social media scrapers & media extractors
│   │   ├── instagram.ts       # Instagram Reels/Posts extractor
│   │   ├── tiktok.ts          # TikTok video/photo extractor
│   │   ├── twitter.ts         # Twitter / X video/image extractor
│   │   ├── types.ts           # Extractor type definitions
│   │   └── index.ts           # Extractor barrel export
│   └── modules/               # Feature modules
│       ├── index.ts           # Auto-generated module registry (DO NOT EDIT)
│       ├── start.ts           # /start command & menu
│       ├── downloader.ts      # Multi-platform media downloader
│       └── web.ts             # Web screenshot & /setprefix commands
└── tests/
    ├── extractors.test.mjs    # Tests for media extractor URL detection
    ├── module_system.test.mjs # Tests for module registry & event handling
    ├── prefix_owner.test.mjs  # Tests for strict prefix enforcement & owner auth
    └── worker.test.mjs        # Tests for Worker server, auth & webhook handling
```

---

## Developer Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local development server with Wrangler |
| `npm run make:module <name>` | Scaffolds a new module and updates `src/modules/index.ts` |
| `npm run generate:modules` | Scans `src/modules/` and updates `src/modules/index.ts` |
| `npm run watch:modules` | Watches `src/modules/` for added/deleted module files |
| `npm run typecheck` | Validates TypeScript types across the entire codebase |
| `npm test` | Runs the Node.js test suite (`tests/*.test.mjs`) |
| `npm run build` | Builds bundle and performs a dry-run Wrangler deployment |
| `npm run deploy` | Deploys the worker to Cloudflare production |
| `npm run clean` | Cleans build cache (`dist/`, `.wrangler/`) |

---

## License

This project is licensed under the [MIT License](LICENSE).
