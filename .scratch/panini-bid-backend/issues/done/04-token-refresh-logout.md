Status: ready-for-agent

# Token refresh + logout

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The session-continuation path (ADR-0011): `POST /auth/refresh` exchanges a valid refresh token for a new short-lived access token, so a User stays logged in without re-authenticating. `POST /auth/logout` revokes the refresh token so it can no longer mint access tokens; the client discards its access token. No server-side session store — refresh-token validity is the only server-side session state.

## Acceptance criteria

- [ ] Valid refresh token → new access token that grants access to protected endpoints
- [ ] Expired access token is rejected with a locale-neutral auth error; refreshing then restores access
- [ ] Refresh with an unknown or revoked token → locale-neutral auth error, no token issued
- [ ] After `POST /auth/logout`, the refresh token no longer grants new access tokens
- [ ] Tests drive refresh/expiry/logout through real HTTP against the running app

## Blocked by

- `02-google-login-jwt-session.md`
