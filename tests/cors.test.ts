import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp } from './harness';
import { configFromEnv, DEV_ALLOWED_ORIGINS } from '../src/config';
import type { RunningApp } from '../src/server';

// Spec of the CORS seam (issue 23): the Ionic Vue front-end calls this API
// from browser/WebView origins, so requests bearing an allowed Origin must
// receive CORS headers and succeed; everything else (non-browser clients,
// which send no Origin at all) is unaffected. The allow-list comes from
// CORS_ALLOWED_ORIGINS (comma-separated) and defaults to the dev origins.

describe('CORS allow-list (issue 23)', () => {
  it('a request bearing an allowed Origin receives CORS headers and succeeds', async () => {
    const app: RunningApp = await startTestApp();
    try {
      const res = await request(app.server)
        .get('/health')
        .set('Origin', 'http://localhost:8100');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8100');
    } finally {
      await app.stop();
    }
  });

  it('an origin outside the allow-list receives no CORS headers — the browser blocks it', async () => {
    const app: RunningApp = await startTestApp();
    try {
      const res = await request(app.server)
        .get('/health')
        .set('Origin', 'https://evil.example');

      // The request still succeeds server-side (CORS is enforced by the
      // browser, not the server), but without CORS headers the browser
      // will not expose the response to that origin.
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.stop();
    }
  });

  it('the allow-list is configurable: an app booted with custom origins serves CORS headers for them (and not for the dev defaults)', async () => {
    const app: RunningApp = await startTestApp({
      allowedOrigins: ['https://custom.example', 'capacitor://localhost'],
    });
    try {
      const allowed = await request(app.server)
        .get('/health')
        .set('Origin', 'https://custom.example');
      expect(allowed.status).toBe(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://custom.example');

      // A dev-default origin is no longer allowed once the list is overridden.
      const formerDefault = await request(app.server)
        .get('/health')
        .set('Origin', 'http://localhost:8100');
      expect(formerDefault.status).toBe(200);
      expect(formerDefault.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.stop();
    }
  });

  it('CORS_ALLOWED_ORIGINS (comma-separated) feeds the allow-list through configFromEnv; unset it falls back to the four dev origins', () => {
    expect(configFromEnv({ CORS_ALLOWED_ORIGINS: 'https://custom.example, capacitor://localhost' }).http).toEqual({
      allowedOrigins: ['https://custom.example', 'capacitor://localhost'],
    });
    expect(configFromEnv({}).http).toEqual({ allowedOrigins: DEV_ALLOWED_ORIGINS });
  });

  it('a preflight OPTIONS from an allowed origin (POST with content-type and authorization headers) is answered with the right CORS headers', async () => {
    const app: RunningApp = await startTestApp();
    try {
      // The browser client preflights exactly this shape before POSTing JSON
      // with an Authorization header (e.g. /auth/login/google, /auth/refresh).
      const res = await request(app.server)
        .options('/auth/refresh')
        .set('Origin', 'http://localhost:8100')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type, authorization');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8100');
      expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PATCH');
      expect(res.headers['access-control-allow-headers']).toBe('content-type,authorization');
    } finally {
      await app.stop();
    }
  });
});
