// Development/test helper only. Production always runs PostgreSQL in Compose.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const db = await PGlite.create('.local-db');
const server = new PGLiteSocketServer({ db, port: 54329, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log('TEST ONLY PostgreSQL WASM server ready on 127.0.0.1:54329');
async function stop() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
