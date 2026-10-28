Status: ready-for-agent

# Instagram login + link a second provider to the same identity

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

Add the Instagram Passport strategy (ADR-0010) so a new User can register with Instagram exactly as with Google. Then provider linking (ADR-0003): a User logged in with one provider links the other via `POST /auth/link/:provider`, after which `GET /me` lists both linked providers and either provider's login reaches the same User.

Auto-linking: logging in via a second provider whose email matches an existing User resolves to that User (one User, two identities). When emails do not match, no silent merge happens — the accounts stay separate until the User manually links them through the linking endpoint.

## Acceptance criteria

- [ ] New User can register via Instagram (User + identity created, JWT issued)
- [ ] Login via a second provider with a matching email resolves to the existing User — one User, two `user_identities` rows
- [ ] `POST /auth/link/:provider` links a provider to the authenticated User; `GET /me` then lists both providers
- [ ] Login via a second provider with a non-matching email creates a separate User (no silent merge)
- [ ] Linking a provider already linked to a different User is rejected with a locale-neutral error
- [ ] All flows tested through the seam; only the providers' OAuth endpoints are stubbed

## Blocked by

- `02-google-login-jwt-session.md`
