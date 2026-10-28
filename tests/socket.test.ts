import { describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { startTestApp, TEST_JWT_SECRET } from './harness';

// Spec of the real-time seam: a real socket.io-client connects to the same
// HTTP server that serves the API — no separate port — presenting the JWT
// at connect time (ADR-0011). The old "unauthenticated connections are
// accepted" contract was intentionally replaced with the auth contract:
// valid token accepted; missing or invalid token rejected.

function connect(port: number, opts: { auth?: { token: string }; extraHeaders?: Record<string, string> } = {}) {
  return io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
    ...opts,
  });
}

function settled(client: Socket): Promise<'connected' | Error> {
  return new Promise((resolve) => {
    client.once('connect', () => resolve('connected'));
    client.once('connect_error', (err: Error) => resolve(err));
  });
}

function validToken(): string {
  return jwt.sign({ sub: 'socket-test-user' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: 900,
  });
}

describe('real-time seam (Socket.IO auth on the same HTTP server)', () => {
  it('accepts a connection presenting a valid JWT via handshake auth, on the same port as the HTTP API', async () => {
    const app = await startTestApp();
    try {
      const client = connect(app.port, { auth: { token: validToken() } });
      const outcome = await settled(client);
      expect(outcome).toBe('connected');
      expect(client.connected).toBe(true);
      client.disconnect();

      // Same HTTP server: the health endpoint answers on the very same port.
      const res = await request(app.server).get('/health');
      expect(res.status).toBe(200);
    } finally {
      await app.stop();
    }
  });

  it('accepts a connection presenting the JWT as an Authorization Bearer header', async () => {
    const app = await startTestApp();
    try {
      const client = connect(app.port, {
        extraHeaders: { authorization: `Bearer ${validToken()}` },
      });
      const outcome = await settled(client);
      expect(outcome).toBe('connected');
      client.disconnect();
    } finally {
      await app.stop();
    }
  });

  it('rejects a connection without a token: connect_error carries a locale-neutral code', async () => {
    const app = await startTestApp();
    try {
      const client = connect(app.port);
      const outcome = await settled(client);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/^[A-Z][A-Z0-9_]*$/); // code, not prose
      expect(client.connected).toBe(false);
      client.disconnect();
    } finally {
      await app.stop();
    }
  });

  it('rejects a connection with an invalid (wrongly signed) token', async () => {
    const app = await startTestApp();
    try {
      const forged = jwt.sign({ sub: 'socket-test-user' }, 'not-the-test-secret', {
        algorithm: 'HS256',
        expiresIn: 900,
      });
      const client = connect(app.port, { auth: { token: forged } });
      const outcome = await settled(client);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(client.connected).toBe(false);
      client.disconnect();
    } finally {
      await app.stop();
    }
  });
});
