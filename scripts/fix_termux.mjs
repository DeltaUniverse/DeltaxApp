import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * On Termux (Android), `/usr/bin/env` does not exist.
 * Husky generates helper scripts inside `.husky/_/` with `#!/usr/bin/env sh`.
 * This script runs `termux-fix-shebang` on Termux only, leaving standard
 * environments (Linux, macOS, Windows, CI) completely untouched.
 */
if (process.platform === 'android') {
  try {
    execSync('which termux-fix-shebang', { stdio: 'ignore' });

    if (existsSync('.husky/_')) {
      execSync('termux-fix-shebang .husky/_/* 2>/dev/null', { stdio: 'ignore' });
    }
    if (existsSync('.husky')) {
      execSync('termux-fix-shebang .husky/* 2>/dev/null', { stdio: 'ignore' });
    }
  } catch {
    // Non-fatal if termux-fix-shebang is unavailable or files do not exist
  }
}
