#!/usr/bin/env node

/**
 * CLI Scaffolding tool for Telegram Bot Modules.
 * Usage:
 *   npm run make:module <module-name>
 *   node scripts/create-module.mjs <module-name>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const modulesDir = path.resolve(rootDir, 'src/modules');

const rawName = process.argv[2];

if (!rawName) {
  console.error('\x1b[31mError: Please provide a module name.\x1b[0m');
  console.log('Usage:');
  console.log('  npm run make:module <name>');
  console.log('Example:');
  console.log('  npm run make:module weather');
  process.exit(1);
}

// Clean and validate name
const sanitized = rawName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
if (!sanitized) {
  console.error('\x1b[31mError: Invalid module name. Use letters, numbers, hyphens or underscores.\x1b[0m');
  process.exit(1);
}

function toPascalCase(str) {
  return str
    .replace(/[-_]([a-z0-9])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

const moduleId = sanitized.replace(/-/g, '_');
const className = `${toPascalCase(sanitized)}Module`;
const commandName = sanitized.replace(/_/g, '-');
const humanName = sanitized
  .split(/[-_]/)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ');

const targetFile = path.resolve(modulesDir, `${sanitized}.ts`);

if (fs.existsSync(targetFile)) {
  console.error(`\x1b[31mError: Module file already exists: src/modules/${sanitized}.ts\x1b[0m`);
  process.exit(1);
}

const template = `import { BaseModule, type CommandContext } from '../core';
import { html, code } from '../html';

export class ${className} extends BaseModule {
  readonly id = '${moduleId}';
  readonly name = '${humanName}';
  readonly description = 'Provides ${humanName} functionality';
  readonly version = '1.0.0';

  public setup(): void {
    this.command(
      ['${commandName}'],
      async (ctx: CommandContext) => {
        const user = ctx.from?.first_name || 'User';
        await ctx.respond(html\`<b>${humanName}</b>\\n\\nHello, \${user}. The <code>\${ctx.prefix}${commandName}</code> command is active.\`);
      },
      { description: 'Execute ${humanName} feature' }
    );
  }
}
`;

fs.writeFileSync(targetFile, template, 'utf-8');
console.log(`[Module] Successfully created module: src/modules/${sanitized}.ts`);

// Trigger auto-import to register the new module immediately
try {
  execSync('node scripts/auto-import.mjs', { cwd: rootDir, stdio: 'inherit' });
  console.log(`[Module] Auto-import updated with ${className}.`);
} catch (err) {
  console.error('\x1b[31mFailed to run auto-import generator:\x1b[0m', err);
}
