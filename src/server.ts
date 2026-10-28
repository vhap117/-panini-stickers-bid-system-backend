import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { Server as SocketIoServer } from 'socket.io';
import type { Knex } from 'knex';
import { createApp } from './app';
import { createDb } from './db';
import { installSocketAuth } from './auth/socket-middleware';
import { createStorage } from './storage';
import type { AppConfig } from './config';

export interface RunningApp {
  app: Express;
  server: http.Server;
  io: SocketIoServer;
  port: number;
  db: Knex;
  stop: () => Promise<void>;
}

/**
 * Boots the app: Express + health endpoint on an HTTP server, Socket.IO
 * attached to that SAME server (ADR-0008 — no separate port), and a Knex
 * instance wired to the configured database. `port: 0` binds an ephemeral
 * port (used by the test harness); the resolved port is returned.
 *
 * Login is provider-native and verification is server-side (ADR-0016), so
 * there is no OAuth callback URL to derive and no strategy to register —
 * the app needs no knowledge of its own port before serving requests. The
 * database is NOT contacted at boot — the Knex pool is lazy, so the app
 * starts and stays up even while the database is still becoming ready.
 */
export async function start(config: AppConfig): Promise<RunningApp> {
  // Fail closed (layer 2): even if a caller hand-built the config without
  // going through configFromEnv, the dev login never boots in production.
  if (config.devAuth.enabled && process.env.NODE_ENV === 'production') {
    throw new Error('DEV_AUTH_ENABLED must never be enabled in production');
  }
  // Fail fast: without a Google client id no ID token could ever verify.
  if (!config.auth.googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID is required (the Web-application OAuth client ID)');
  }
  // Fail fast: an unsupported storage driver must refuse to boot, never
  // surface later as a failed Photo upload (ADR-0006).
  const storage = createStorage(config.storage);
  const db = createDb(config.database);
  const app = createApp(db, config.auth, config.http, config.devAuth, storage);
  const server = http.createServer(app);
  const io = new SocketIoServer(server);

  await new Promise<void>((resolve) => server.listen(config.port, '0.0.0.0', resolve));
  const { port } = server.address() as AddressInfo;

  // Socket connections must present a valid JWT at connect time (ADR-0011).
  installSocketAuth(io, config.auth);

  async function stop(): Promise<void> {
    io.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.destroy();
  }

  return { app, server, io, port, db, stop };
}
