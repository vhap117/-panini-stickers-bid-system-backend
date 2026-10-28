# One User account, many linkable social providers

> Superseded-by: [ADR-0016](0016-native-social-login-server-side-token-verification.md) — Google-only, no linking; the one-User-many-identities model itself is retained for the Google identity.

A User is a single identity; social providers (Instagram, Gmail, etc.) are credentials attached to it, not separate accounts. First login creates the account; subsequent logins via a different provider are linked to the existing account, typically by matching email. We chose this over one-account-per-provider because a user's identity as a trader (listings, bids, reputation, location) must not fragment when they switch login methods. The trade-off is a one-time account-linking flow and conflict handling when emails don't match (Instagram doesn't always expose email) — a small UI cost for a coherent identity model.
