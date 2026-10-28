import type { Request, Response } from 'express';

/**
 * One-line-per-request log (dev diagnostics): answers "is the Android
 * emulator reaching the backend, and what is it asking for?" Written on
 * 'finish' so the response status and duration are included. Prints the
 * source address, User-Agent, and Origin — the signals that tell the
 * Android app (WebView/okhttp UA, capacitor://localhost origin) apart
 * from curl, healthchecks, and the Docker NAT (all host-side traffic
 * arrives from the Docker bridge gateway, so the address alone does not
 * identify the emulator).
 *
 * Never logs bodies: token endpoints carry ID/refresh tokens
 * (ADR-0016, ADR-0011). Silent under vitest (NODE_ENV=test) so test
 * output stays clean.
 */
export function requestLog(req: Request, res: Response, next: () => void): void {
  const startedAt = performance.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const source = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'none';
    const origin = req.headers.origin ?? 'none';
    console.log(
      `[request] ${new Date().toISOString()} ${req.method} ${req.originalUrl} from ${source} ` +
        `ua="${userAgent}" origin="${origin}" -> ${res.statusCode} ` +
        `in ${Math.round(performance.now() - startedAt)}ms`,
    );
  });
  next();
}
