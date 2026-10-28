Status: ready-for-agent

# Update own User details — location + preferred locale (PATCH /me)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The authenticated User updates their own details: `PATCH /me` sets the User's location (persisted as a PostGIS geography point) and preferred locale (`en` or `es`). `GET /me` reflects the updates. The location stored here is what the geo-ranked feed will rank against (feed arrives in its own slice); this slice only stores and returns it. All validation errors are locale-neutral (codes + data, no prose).

## Acceptance criteria

- [ ] `PATCH /me` with a location persists it as a geography point; `GET /me` returns it (round-trip asserted via HTTP and via Knex)
- [ ] `PATCH /me` with preferred locale `en` or `es` persists it; `GET /me` returns it
- [ ] Unsupported locale or malformed location → locale-neutral validation error, nothing persisted
- [ ] Unauthenticated `PATCH /me` → auth error
- [ ] Tests go through real HTTP with database assertions via Knex

## Blocked by

- `02-google-login-jwt-session.md`
