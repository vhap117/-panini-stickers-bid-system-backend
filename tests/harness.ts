import os from 'node:os';
import path from 'node:path';
import { createDb } from '../src/db';
import { start, type RunningApp } from '../src/server';
import { DEV_ALLOWED_ORIGINS, type AuthConfig } from '../src/config';
import { TEST_DB } from './test-env';

/**
 * Boots the real app (Express + Socket.IO + Knex) on an ephemeral port,
 * wired to the dedicated test Postgres+PostGIS. Tests drive it only through
 * its external seam: HTTP via supertest against the actually-started server,
 * and real socket.io-client connections.
 */

/** The JWT secret tests hand to the app — lets them craft tokens like clients. */
export const TEST_JWT_SECRET = 'test-jwt-secret';

/** The Web OAuth client id tests hand to the app — the `aud` tokeninfo must report. */
export const TEST_GOOGLE_CLIENT_ID = 'test-google-client-id';

/** The iOS OAuth client id tests can hand to the app for audience testing. */
export const TEST_GOOGLE_IOS_CLIENT_ID = 'test-google-ios-client-id';

/** The Android OAuth client id tests can hand to the app for audience testing. */
export const TEST_GOOGLE_ANDROID_CLIENT_ID = 'test-google-android-client-id';

/** A client id that is intentionally NOT in any audience set. */
export const TEST_GOOGLE_OTHER_CLIENT_ID = 'test-google-other-client-id';

export interface StartTestAppOptions {
  /** Overrides for the auth config; sensible defaults keep no-arg calls working. */
  auth?: {
    jwtSecret?: string;
    accessTokenTtlSeconds?: number;
    refreshTokenTtlDays?: number;
    googleClientId?: string;
    googleIosClientId?: string;
    googleAndroidClientId?: string;
  };
  /**
   * Overrides the CORS allow-list (issue 23); defaults to the dev browser
   * origins so no-arg calls behave like the shipped dev configuration.
   */
  allowedOrigins?: string[];
  /**
   * Registers the development-only `POST /auth/login/dev` route. Off by
   * default, mirroring the fail-closed env default (DEV_AUTH_ENABLED).
   */
  devAuthEnabled?: boolean;
  /**
   * Overrides the Photo storage selection (ADR-0006). Defaults to the local
   * filesystem driver under a harmless temp root; specs that assert on
   * stored bytes pass their own per-test directory.
   */
  storage?: {
    driver?: string;
    localRoot?: string;
    /**
     * S3-compatible settings, passed through only when the caller supplies
     * one. An s3 driver with NO s3 block must still refuse to boot — see the
     * "storage implementation is selected by config" spec.
     */
    s3?: {
      bucket?: string;
      region?: string;
      endpoint?: string;
      publicBaseUrl?: string;
      forcePathStyle?: boolean;
      accessKeyId?: string;
      secretAccessKey?: string;
    };
  };
}

export function startTestApp(opts: StartTestAppOptions = {}): Promise<RunningApp> {
  const auth: AuthConfig = {
    jwtSecret: opts.auth?.jwtSecret ?? TEST_JWT_SECRET,
    accessTokenTtlSeconds: opts.auth?.accessTokenTtlSeconds ?? 900,
    refreshTokenTtlDays: opts.auth?.refreshTokenTtlDays ?? 30,
    googleClientId: opts.auth?.googleClientId ?? TEST_GOOGLE_CLIENT_ID,
    googleIosClientId: opts.auth?.googleIosClientId,
    googleAndroidClientId: opts.auth?.googleAndroidClientId,
  };
  return start({
    port: 0,
    database: { ...TEST_DB },
    auth,
    http: { allowedOrigins: opts.allowedOrigins ?? [...DEV_ALLOWED_ORIGINS] },
    devAuth: { enabled: opts.devAuthEnabled ?? false },
    storage: {
      driver: opts.storage?.driver ?? 'local',
      localRoot: opts.storage?.localRoot ?? path.join(os.tmpdir(), 'panini-test-uploads'),
      // Conditional on purpose: defaults would fabricate an s3 block for an
      // unconfigured s3 driver, which must fail fast instead.
      s3: opts.storage?.s3
        ? {
            bucket: opts.storage.s3.bucket ?? 'panini-photos',
            region: opts.storage.s3.region ?? 'us-east-1',
            endpoint: opts.storage.s3.endpoint,
            publicBaseUrl:
              opts.storage.s3.publicBaseUrl ?? 'http://127.0.0.1:9000/panini-photos',
            forcePathStyle: opts.storage.s3.forcePathStyle ?? true,
            accessKeyId: opts.storage.s3.accessKeyId ?? 'S3RVER',
            secretAccessKey: opts.storage.s3.secretAccessKey ?? 'S3RVER',
          }
        : undefined,
    },
  });
}

/** Separate Knex instance for database-state assertions from tests. */
export function testDb() {
  return createDb({ ...TEST_DB });
}