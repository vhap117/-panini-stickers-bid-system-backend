Status: ready-for-agent

# Google social login → JWT session + GET /me

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The complete first-login-to-authenticated-request path using Google (ADR-0010 Passport strategies, ADR-0003 one User with many linkable identities, ADR-0011 JWT session management): initiate the OAuth flow, handle the callback, create the User and its `user_identities` row on first login, and issue a signed short-lived access token plus a refresh token. Repeat logins with the same Google identity resolve to the same User — no duplicates.

`GET /me` returns the authenticated User's details (id, display name, location, preferred locale) and the list of linked providers.

Requests without a valid access token are rejected with locale-neutral error bodies (codes + data, never prose). Socket.IO connections must present the JWT at connect time; invalid or missing tokens are rejected — verified with a real socket client.

Tests go through the seam: real HTTP and real Socket.IO clients against the running app, database assertions via Knex. Only Google's own OAuth endpoints are stubbed, at the external boundary.

## Acceptance criteria

- [ ] First Google login creates one User with a `user_identities` row (provider, provider user id, email) and issues access + refresh tokens
- [ ] Repeat Google login with the same identity resolves to the existing User (no second User created)
- [ ] `GET /me` with a valid access token returns id, display name, location, preferred locale, and linked providers
- [ ] Missing/expired/invalid token on a protected endpoint → locale-neutral auth error with an appropriate HTTP status
- [ ] Socket.IO connection with a valid JWT is accepted; without one it is rejected
- [ ] Access token is short-lived and signed; refresh token issued alongside it (ADR-0011)
- [ ] All tests drive the real app through HTTP/Socket.IO; only Google's OAuth endpoints are stubbed

## Blocked by

- `01-dev-environment-app-skeleton-test-harness.md`
