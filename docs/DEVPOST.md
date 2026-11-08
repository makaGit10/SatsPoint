# Texte de soumission Devpost — SatsPoint

> À coller dans https://devpost.com/submit-to/26475-dakar-bitcoin-hack-by-btrust/manage/submissions/1287527/project-overview
> Écrit en anglais (deux juges sur trois sont anglophones). Les `[crochets]` sont remplis avec des **mesures réelles** avant la soumission ; toute fonctionnalité non livrée le 20 novembre est **retirée** du texte.

## Project name
```
SatsPoint
```

## Elevator pitch (≤ 200 caractères)
```
SatsPoint is a low-bandwidth Lightning point-of-sale for African merchants: price in FCFA, get paid in sats in seconds, fall back to mobile money when needed. Non-custodial by design.
```

## About the project

```markdown
## Inspiration

In Dakar, a shop owner can receive money from almost anyone — except from the
customer who holds Bitcoin. Diaspora relatives, tourists and a growing local
Bitcoin community are ready to pay in sats, but merchants have no simple,
trustworthy tool to accept them: existing solutions assume a laptop, a stable
connection, technical vocabulary, and prices in dollars.

Meanwhile, merchants already live on mobile money (Wave, Orange Money, Free
Money) and expect one thing from a payment tool: **"Did I get paid — yes or
no — right now?"** And many of them do not read: an app full of text excludes
them.

SatsPoint starts from that question, and from that merchant.

## What it does

SatsPoint turns any mid-range phone into a Bitcoin Lightning point-of-sale:

- **Price in FCFA, pay in sats** — type an amount in XOF; SatsPoint converts it
  at a live rate (median of three sources, frozen per invoice, rounded up to
  the merchant's advantage) and shows a Lightning invoice as a QR code.
- **Instant confirmation** — the merchant's screen turns green the second the
  payment settles, pushed in real time; no refresh, no polling.
- **Voice guidance in Wolof, Serer, Pulaar and Jola** — every button carries a
  small speaker icon; tap it and hear what the button does in your language.
  Even the language selector speaks. Audio is recorded by the platform admin
  in a dedicated studio and published to every device.
- **Merchant wallet built in** — balance, receive, send and history, connected
  to the merchant's *own* wallet through Nostr Wallet Connect (NWC).
  SatsPoint never holds the merchant's funds.
- **Mobile money fallback** — if the customer has no sats, the same sale can be
  settled through PayTech (Wave, Orange Money, Free Money) with automatic
  confirmation, so the merchant never loses a sale.
- **Team and live dashboard** — owner, manager and cashier roles; the owner
  sees every sale appear live on their own phone.
- **Digital receipts** — shareable link (WhatsApp/SMS), no printer needed.
- **Built for real conditions** — French/English interface, light and dark
  themes, plain words instead of jargon, [X] KB initial load, usable on 3G.

**Primary user:** small merchants in Senegal — shops, restaurants, market
vendors. One merchant can serve dozens of customers a day with nothing more
than the phone they already own.

## How we built it

- **Backend:** Laravel 12 (PHP 8.3) REST API, PostgreSQL 16, Redis, Laravel
  Reverb (WebSockets) for real-time signals that carry no data (screens reload
  through the API, with its access controls).
- **Frontend:** React 19 + TypeScript + Vite PWA, installable, mobile-first.
- **Lightning:** a dedicated gateway (Node, `@getalby/sdk`) speaking
  Nostr Wallet Connect (NIP-47) to the merchant's wallet — `make_invoice`,
  `lookup_invoice`, `get_balance`, `list_transactions`, `pay_invoice` with
  budget — isolated on the internal network and authenticated with HMAC.
  Demo on **mainnet** with real sats.
- **Mobile money:** PayTech API (Wave, Orange Money, Free Money) with verified
  IPN callbacks.
- **Voice:** in-browser recording studio for the admin, server-side ffmpeg
  normalisation, content-addressed MP3s cached by the service worker.
- **One-command setup:** `docker compose up` starts everything with demo data;
  without any configuration it runs with a simulated wallet and a visible
  "demo mode" banner, so judges can test the full flow in two minutes.

**Security by design:** non-custodial; NWC and PayTech secrets encrypted at
rest with a key separate from the app key and never sent to the browser;
payment status decided only server-side after re-verification; least
privilege (cashiers cannot see the balance or send; the platform admin cannot
see merchants' money); opaque ULIDs + policies + an automated anti-IDOR sweep;
strict input validation and rate limits; no PII in logs; a written
[threat model](docs/THREAT_MODEL.md).

## Challenges we ran into

- **Rate volatility vs. invoice lifetime:** a price shown in FCFA must stay
  fair for both sides. We lock the rate per invoice, expire invoices quickly
  and regenerate them in one tap.
- **Rounding between FCFA and sats:** XOF has no decimals and sats are tiny
  units; explicit rounding rules guarantee the merchant always receives at
  least the displayed price.
- **Real-time on unstable networks:** WebSocket connections drop on mobile
  networks; we added reconnection and a status re-check so a payment is never
  "lost" on screen.
- **Serving merchants who do not read:** we designed a voice layer that is
  impossible to forget — every new button automatically appears in the admin
  studio as "audio missing".
- [À compléter avec les vrais obstacles rencontrés]

## Accomplishments that we're proud of

- An end-to-end payment — FCFA amount → QR → payment → green screen — in
  [X] seconds on a mid-range Android phone, on the real Lightning network.
- A non-custodial architecture: merchants keep full control of their funds.
- Voice guidance in four Senegalese languages.
- One-command setup with seed data and a demo mode, so judges can test
  without any wallet.
- [À compléter]

## What we learned

- Lightning's speed is a UX feature, not just a technical one: instant
  settlement is exactly what merchants used to mobile money expect.
- Nostr Wallet Connect makes non-custodial integrations dramatically simpler
  than running a node per merchant.
- Adoption depends less on Bitcoin itself than on speaking the merchant's
  language — FCFA, French, Wolof, "paid / not paid".

## What's next for SatsPoint

- **Off-ramp to mobile money:** partner with a local exchange so merchants can
  convert sats to FCFA on demand.
- **Spoken amounts** ("fifteen thousand francs") assembled from recorded
  numbers, then full voice-driven operation.
- **E-commerce plugin:** the same checkout embedded in online stores.
- **Offline mode with USSD/SMS** confirmations for low-connectivity areas.
- **Pilot:** onboard 10 merchants in one Dakar neighbourhood and track weekly
  active merchants, payments per merchant per week, median confirmation time,
  and the share of sales settled in sats vs. mobile money.
```

## Built with
```
bitcoin, lightning-network, nostr, nostr-wallet-connect, laravel, php, postgresql, redis, react, typescript, vite, pwa, websockets, laravel-reverb, docker, caddy, frankenphp, paytech, ffmpeg
```

## Try it out links
- `https://github.com/makaGit10/SatsPoint`
- `https://satspoint.onrender.com`

## Video demo link
`[YouTube]` — 3 minutes, dans l'ordre exigé : problème → solution (démo réelle) → impact → prochaines étapes.
