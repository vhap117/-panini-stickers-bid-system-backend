Status: ready-for-agent

# OAuth callback client handoff (ADR-0015)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

Implement ADR-0015 for browser clients (the Ionic Vue front-end): a `handoff_codes` table (single-use, ~60s TTL — kind `login|link`, payload, consumed on exchange), and login + link callbacks that — when `CLIENT_CALLBACK_BASE` is configured — respond with a 302 to `{base}/auth/callback` (login) or `{base}/auth/link/callback` (link), carrying `?code=…` on success or `?error=<locale-neutral code>` on failure (`AUTH_FAILED`, `PROVIDER_ALREADY_LINKED`, `UNAUTHENTICATED`). A new `POST /auth/handoff` exchanges a valid, unconsumed, unexpired code for its payload: login → the `AUTHENTICATED` session payload, link → the `LINKED` providers payload. Single-use is enforced by consuming the row at exchange; used, expired, and unknown codes are indistinguishable (401 `UNAUTHENTICATED`, locale-neutral). When `CLIENT_CALLBACK_BASE` is unset, the callbacks keep responding with JSON exactly as today — the existing tests remain the authority for the JSON contract and must pass unchanged. Dev default for `CLIENT_CALLBACK_BASE`: `http://localhost:8100` (the front-end dev server); device testing overrides it to `paninibid://`.

## Acceptance criteria

- [ ] With `CLIENT_CALLBACK_BASE` set: the login callback 302s to `{base}/auth/callback?code=…`; `POST /auth/handoff` returns the session payload; the code is single-use (second exchange → 401) and expires (~60s)
- [ ] The link callback 302s to `{base}/auth/link/callback?code=…`; its exchange returns the providers payload; an identity conflict (the 409 case) redirects with `?error=PROVIDER_ALREADY_LINKED` and mints no code
- [ ] Any callback failure redirects with `?error=<code>`; no code is minted
- [ ] Used, expired, and unknown codes are indistinguishable on exchange (401, locale-neutral)
- [ ] With `CLIENT_CALLBACK_BASE` unset: existing JSON behavior and all current tests unchanged
- [ ] All flows tested through the seam (real HTTP; only the providers' OAuth endpoints stubbed)

## Blocked by

None — amends the done issues 02/03 flows; independent of pending 06–21.
