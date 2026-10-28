import { configFromEnv } from './config';
import { start } from './server';

/** Entry point for ts-node-dev (docker compose app service / npm run dev). */
async function main(): Promise<void> {
  const running = await start(configFromEnv());
  console.log(`[panini-bid] listening on port ${running.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[panini-bid] ${signal} received, shutting down`);
    await running.stop();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[panini-bid] failed to start', err);
  process.exit(1);
});
