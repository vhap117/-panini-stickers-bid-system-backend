import type { Server as SocketIoServer, Socket } from 'socket.io';
import type { AuthConfig } from '../config';
import { verifyAccessToken } from './tokens';

/**
 * Socket.IO connect-time auth (ADR-0011): the client presents the JWT either
 * in `handshake.auth.token` or as an `Authorization: Bearer` header. Invalid
 * or missing tokens reject the handshake — real clients see `connect_error`
 * with a locale-neutral code (ADR-0014), never prose.
 */
export function installSocketAuth(io: SocketIoServer, auth: AuthConfig): void {
  io.use((socket: Socket, next) => {
    const header = socket.handshake.headers.authorization;
    const headerToken = header?.match(/^Bearer (.+)$/)?.[1];
    const token = (socket.handshake.auth?.token as string | undefined) ?? headerToken;

    const userId = token ? verifyAccessToken(auth, token) : null;
    if (!userId) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    socket.data.userId = userId;
    next();
  });
}
