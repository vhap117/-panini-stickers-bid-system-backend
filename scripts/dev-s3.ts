import S3rver from 's3rver';

/**
 * Local S3-compatible server for trying the S3 storage driver without a
 * cloud account (ADR-0006). `s3rver` speaks the real S3 wire protocol with
 * real SigV4 signing, so the AWS SDK path is genuinely exercised — this is
 * a server, not a mock of our own code.
 *
 *   npm run dev:s3
 *
 * Then point the app at it with the settings printed below. The credentials
 * are s3rver's single hardcoded account; any other key is rejected.
 */

const PORT = Number(process.env.S3_DEV_PORT ?? 9000);
const BUCKET = process.env.S3_DEV_BUCKET ?? 'panini-photos';

async function main(): Promise<void> {
  const server = new S3rver({
    port: PORT,
    address: '127.0.0.1',
    silent: true,
    // Objects live in a temp directory that is wiped on shutdown.
    resetOnClose: true,
    // Pre-created so the driver has somewhere to write on first upload.
    configureBuckets: [{ name: BUCKET, configs: [] }],
  });

  await server.run();

  console.log(`S3-compatible server listening on http://127.0.0.1:${PORT}`);
  console.log(`bucket: ${BUCKET}`);
  console.log('');
  console.log('Point the app at it with:');
  console.log('  STORAGE_DRIVER=s3');
  console.log(`  S3_BUCKET=${BUCKET}`);
  console.log(`  S3_ENDPOINT=http://127.0.0.1:${PORT}`);
  console.log(`  S3_PUBLIC_BASE_URL=http://127.0.0.1:${PORT}/${BUCKET}`);
  console.log('  S3_FORCE_PATH_STYLE=true');
  console.log('  S3_ACCESS_KEY_ID=S3RVER');
  console.log('  S3_SECRET_ACCESS_KEY=S3RVER');
  console.log('');
  console.log('Ctrl+C to stop.');

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
