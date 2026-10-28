# Panini Stickers Bid System

A backend where users photograph Panini stickers, publish them to a feed, and bid on each other's stickers in real time.

## Language

**Album**:
A named Panini collection/edition that stickers belong to (e.g. "Qatar 2022 World Cup"). A sticker has no meaning outside the album it belongs to.
_Avoid_: Collection, set, series

**Sticker**:
A catalog type within an album, identified by its number and subject (e.g. "Messi, #234, Qatar 2022"). Shared reference data — not the physical item being sold.
_Avoid_: Card, item, piece

**Listing**:
A specific physical sticker a user has photographed, published to the feed, and opened for bidding. Bids attach to a Listing, not to a Sticker. A Listing references one Sticker (and thus one Album) and is owned by one user (the seller).
_Avoid_: Post, offer, auction, ad

**Photo**:
A photograph of one side of a Listing's physical Sticker, uploaded by the seller. A Listing is photographed from both sides — `front` and `back` — because condition is judged from both faces; which face a Photo shows is its **side**, never a role or a purpose. A Photo belongs to exactly one Listing.
_Avoid_: Image, picture, attachment, role, shot

**User**:
A registered person who can publish Listings (as a seller) and place Bids (as a bidder). Carries a location used to rank the feed by proximity to the viewer, and a preferred locale (English or Spanish at launch; French and Portuguese later) used for rendering defaults and future notifications.
_Avoid_: Account, member, profile

**Bid**:
An offer on a published Listing. A Bid can be monetary (a cash amount), a trade (offering one of the bidder's own stickers in exchange, referenced by Sticker type), or a combination of both. The offered sticker in a trade is a claim by the bidder, not a system-verified inventory item. A Listing ends when its seller accepts one of its Bids.
_Avoid_: Offer, proposal, bet

**Chat Room**:
A real-time group conversation attached to a published Listing. The seller and all bidders on that Listing share one room. Bids are submitted through a structured bidding action and appear in the room as offer events, not as typed text; chat messages are free-form conversation around the bids.
_Avoid_: Channel, thread, conversation

**Message**:
A free-form text entry in a Chat Room, persisted alongside the Listing's Bid history. A late joiner sees past Messages and Bids on load; the socket carries only new events from the point they connect.
_Avoid_: Text, comment, note

**Direct Chat**:
A private 1:1 conversation between two users, opened only after a Listing ends as `sold` — between the seller and the winning bidder. It is the fulfillment channel for arranging the physical exchange (meetup, swap, or cash handover). Not tied to a Listing's Chat Room and not visible to other users. Cannot be opened before or independently of a completed sale.
_Avoid_: DM, private message, thread

## Rules

- A Listing moves through states: `draft` (photo uploaded, details being filled) → `published` (live in the feed, open for bids) → `sold` (seller accepted a bid) or `cancelled` (seller withdrew without accepting).
- When a seller accepts a Bid, all other Bids on that Listing are rejected and their bidders are notified in real time.
- Only `published` Listings appear in the feed and accept Bids.
- A bidder has one active Bid per Listing. Raising or changing an offer updates the existing Bid rather than creating a new one; the update is emitted as a real-time event in the Listing's Chat Room.
- When a Listing ends (`sold` or `cancelled`), its Chat Room closes: no new Messages or Bid events are accepted. The persisted history (Bids and Messages) remains readable via REST.
- The Album/Sticker catalog is multilingual: canonical entries carry per-locale display names (English and Spanish at launch, French and Portuguese later), and catalog search matches across all locales.
- The wire format is locale-neutral: API errors and socket events carry codes and data, never prose — wording, dates, and amounts are formatted client-side. Chat Messages and Listing descriptions are stored as written, never translated server-side.
