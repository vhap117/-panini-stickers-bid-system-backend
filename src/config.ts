/**
 * Minimal env-var configuration (no config library yet).
 *
 * Accepts either DATABASE_URL (postgres://user:password@host:port/database)
 * or discrete PG* variables, plus PORT. Sane defaults match docker-compose.yml.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface AuthConfig {
  jwtSecret: string;
  /** Short-lived access token (ADR-0011: 15 minutes by default). */
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  /**
   * The Web OAuth client the ID token must be issued for
   * (GOOGLE_CLIENT_ID — the Web-application client; ADR-0016). No client
   * secret exists anywhere: login is native, verification is server-side.
   *
   * For a Capacitor app that signs in natively, the same backend verifies
   * tokens from each platform, whose `aud` claim is the OAuth client id
   * Google issued for THAT platform (Web, iOS, Android are three distinct
   * client ids under one Cloud project). `googleIosClientId` and
   * `googleAndroidClientId` add them to the accepted audience set when set;
   * leaving either unset refuses tokens minted for that platform — fine in
   * dev, wrong in production for any app that ships both.
   */
  googleClientId: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
}

/**
 * HTTP-surface settings. CORS is not authentication, so the browser-origin
 * allow-list lives here rather than in AuthConfig (issue 23).
 */
export interface HttpConfig {
  /** Origins allowed to call the API from a browser/WebView (issue 23). */
  allowedOrigins: string[];
}

/**
 * Development-only login surface. When `enabled`, the app exposes
 * `POST /auth/login/dev`, a fixed local identity so the Web front-end can
 * develop against the real API without a social-login round trip. It is
 * fail-closed: disabled by default, and refused outright in production.
 */
export interface DevAuthConfig {
  enabled: boolean;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  auth: AuthConfig;
  http: HttpConfig;
  devAuth: DevAuthConfig;
}

/**
 * Dev-default browser origins (issue 23): the Ionic Vue front-end's
 * `ionic serve` (`http://localhost:8100`), the Android WebView origins
 * (`http://localhost`, `https://localhost`), and the iOS WebView origin
 * (`capacitor://localhost`).
 */
export const DEV_ALLOWED_ORIGINS: string[] = [
  'http://localhost:8100',
  'http://localhost:8101',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];

function httpFromEnv(env: NodeJS.ProcessEnv): HttpConfig {
  return {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS
      ? env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : [...DEV_ALLOWED_ORIGINS],
  };
}

function databaseFromEnv(env: NodeJS.ProcessEnv): DatabaseConfig {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
    };
  }
  return {
    host: env.PGHOST ?? '127.0.0.1',
    port: Number(env.PGPORT ?? 5432),
    user: env.PGUSER ?? 'panini',
    password: env.PGPASSWORD ?? 'panini',
    database: env.PGDATABASE ?? 'panini_bid',
  };
}

function authFromEnv(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    jwtSecret: env.JWT_SECRET ?? 'dev-insecure-jwt-secret',
    accessTokenTtlSeconds: Number(env.JWT_ACCESS_TOKEN_TTL_SECONDS ?? 900),
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    // No dev default: the app refuses to start without it (see src/server.ts).
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    googleIosClientId: env.GOOGLE_IOS_CLIENT_ID,
    googleAndroidClientId: env.GOOGLE_ANDROID_CLIENT_ID,
  };
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const devAuthEnabled = devAuthEnabledFromEnv(env);
  // Fail closed (layer 1): the dev login must never exist in production.
  if (devAuthEnabled && env.NODE_ENV === 'production') {
    throw new Error('DEV_AUTH_ENABLED must never be enabled in production');
  }
  return {
    port: Number(env.PORT ?? 3000),
    database: databaseFromEnv(env),
    auth: authFromEnv(env),
    http: httpFromEnv(env),
    devAuth: { enabled: devAuthEnabled },
  };
}

/**
 * `true` or `1`, case-insensitive, enables dev auth. Anything else —
 * including unset — disables it (fail-closed default).
 */
function devAuthEnabledFromEnv(env: NodeJS.ProcessEnv): boolean {
  const value = env.DEV_AUTH_ENABLED?.toLowerCase();
  return value === 'true' || value === '1';
}