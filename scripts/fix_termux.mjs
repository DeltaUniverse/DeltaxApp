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

    const workerdPath = 'node_modules/workerd/lib/main.js';
    if (existsSync(workerdPath)) {
      const fs = await import('node:fs');
      const content = fs.readFileSync(workerdPath, 'utf8');
      if (content.includes('var { binPath } = generateBinPath();')) {
        const patched = content.replace(
          'var { binPath } = generateBinPath();',
          'var binPath;\ntry {\n  binPath = generateBinPath().binPath;\n} catch {\n  binPath = "";\n}'
        );
        fs.writeFileSync(workerdPath, patched);
      }
    }
  } catch {
    // Non-fatal if termux-fix-shebang is unavailable or files do not exist
  }
}
