import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// macOS often exposes /var through a /private/var symlink. Node resolves ESM
// import URLs, while process.argv[1] can retain the caller's original path.
export function isDirectExecution(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try { return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath); }
  catch { return false; }
}
