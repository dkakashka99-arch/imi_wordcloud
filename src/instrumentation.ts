export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_URL) {
    const { startSemanticWorker } = await import('./lib/semantic/worker');
    startSemanticWorker();
  }
}
