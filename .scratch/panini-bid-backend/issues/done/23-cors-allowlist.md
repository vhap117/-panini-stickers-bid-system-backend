Status: ready-for-agent

# CORS allow-list for browser clients

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

Express `cors` middleware with a config-driven allow-list (`CORS_ALLOWED_ORIGINS`, comma-separated), so the Ionic Vue front-end (sibling repo) can call the API from its runtime origins. Dev defaults: `http://localhost:8100` (the front-end's `ionic serve`), `http://localhost` and `https://localhost` (Android WebView origins), `capacitor://localhost` (iOS WebView origin). No other behavior change — non-browser clients (the test suite, direct API consumers) are unaffected.

## Acceptance criteria

- [ ] A request bearing an allowed `Origin` receives CORS headers and succeeds
- [ ] An origin outside the list receives no CORS headers (browser-blocked)
- [ ] The allow-list is env-configurable; tests assert the headers through real HTTP
- [ ] All existing tests pass unchanged

## Blocked by

None.
