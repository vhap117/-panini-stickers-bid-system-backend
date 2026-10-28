import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb } from './harness';
import type { RunningApp } from '../src/server';

// Spec of the API seam: the health endpoint is proven through the full stack —
// harness-booted app, real Postgres+PostGIS with migrations applied, real HTTP.
describe('health seam (GET /health)', () => {
  let app: RunningApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  it('returns 200 with real database connectivity behind a booted app', async () => {
    const res = await request(app.server).get('/health');
    expect(res.status).toBe(200);
  });

  it('responds with a locale-neutral JSON body: a machine-readable code plus data, never prose', async () => {
    const res = await request(app.server).get('/health');

    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body.code).toBeTypeOf('string');
    expect(res.body.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(res.body.data).toBeTypeOf('object');
    expect(res.body.data.database).toBe('UP');
  });

  it('runs against a real PostGIS database with migrations applied from a clean state', async () => {
    const db = testDb();
    try {
      const result = await db.raw('select postgis_full_version() as postgis_full_version');
      const rows = result.rows as { postgis_full_version: string }[];
      expect(rows[0].postgis_full_version).toMatch(/POSTGIS/i);
    } finally {
      await db.destroy();
    }
  });
});
