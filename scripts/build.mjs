import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
// A clean runtime output prevents stale/empty Next manifests after incremental rebuilds.
await rm('.next', { recursive: true, force: true });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
