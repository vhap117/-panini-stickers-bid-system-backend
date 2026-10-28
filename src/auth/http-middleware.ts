import type { NextFunction, Request, Response } from 'express';
import type { AuthConfig } from '../config';
import { verifyAccessToken } from './tokens';

/**
 * REST auth middleware (ADR-0011): expects `Authorization: Bearer <jwt>`,
 * verifies signature + expiry, and attaches the authenticated User's id to
 * the request. Rejections are locale-neutral (ADR-0014): code + data only.
 */
export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAccessToken(auth: AuthConfig) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const match = header?.match(/^Bearer (.+)$/);
    const token = match?.[1];

    const userId = token ? verifyAccessToken(auth, token) : null;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    req.userId = userId;
    next();
  };
}
