// Isolated development verification; never used by production.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 54329, host: '127.0.0.1', maxConnections: 10 });
await server.start();
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres',
  DB_POOL_MAX: '1',
};
function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Check exited ${code}`)),
    );
  });
}
try {
  console.log(
    'LOCAL TEST ONLY: PostgreSQL WASM, single connection; native PostgreSQL concurrency remains a CI gate.',
  );
  await run(['--import', 'tsx', 'scripts/migrate.ts']);
  await run(['--import', 'tsx', 'scripts/seed.ts', 'ops/event-27-oct.json']);
  await run(['--import', 'tsx', 'scripts/seed.ts', 'ops/event-27-oct.json']);
  await run(['node_modules/vitest/vitest.mjs', 'run', 'tests/integration']);
  await run(['--import', 'tsx', 'scripts/check-http.ts']);
} finally {
  await server.stop();
  await db.close();
}
