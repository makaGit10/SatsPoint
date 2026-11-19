# Texte de soumission Devpost — SatsPoint

> À coller dans https://devpost.com/submit-to/26475-dakar-bitcoin-hack-by-btrust/manage/submissions/1287527/project-overview
> Écrit en anglais (deux juges sur trois sont anglophones). Mis à jour le 19/11 : uniquement ce qui est réellement livré et vérifié.

## Project name
```
SatsPoint
```

## Elevator pitch (≤ 200 caractères)
```
The bitcoin till that speaks the merchant's language: price in FCFA, get paid in sats, hear every button in Wolof. Built for African merchants who don't read. Non-custodial.
```

## About the project

```markdown
## Inspiration

In Dakar, a market vendor like Awa gets paid by almost everyone — except the
customer who holds bitcoin. Existing tools are written text, in English, in
dollars, and assume a laptop and a good connection. And many merchants do not
read: an app full of text is a closed door.

Meanwhile, they already live on mobile money (Wave, Orange Money, Free Money)
and expect one thing from a payment tool: **"Did I get paid — yes or no —
right now?"**

SatsPoint starts from that merchant, and from that question.

## What it does

SatsPoint turns any mid-range phone into a Bitcoin Lightning point-of-sale that
**talks**:

- **Her language, out loud, from the first launch** — the language picker
  speaks; every button has a small speaker that says what it does. Voices are
  real human recordings: **Wolof is recorded and live** (the phrases a merchant
  hears while selling); Serer, Pulaar and Jola are ready to record.
- **Each country, its own languages** — pick another country and the list of
  languages changes. A missing language? The platform admin adds it from the
  console in seconds (we added Bambara for Mali in the demo), records its
  phrases in the built-in studio, and it shows up instantly for that country.
- **Add products without typing** — the app asks, in Wolof, "what is this
  product called?"; the merchant says the name into the mic and hears it every
  time she taps the product. The price can be **spoken** ("two hundred francs")
  and writes itself — still editable with one tap. Pictures and pictograms
  replace written names.
- **Price in FCFA, pay in sats** — the amount is converted at a live rate
  (median of three sources, frozen per invoice, rounded to the merchant's
  advantage) into a Lightning invoice shown as a QR code, valid five minutes.
- **The server decides "paid"** — the payment is verified with the merchant's
  wallet (`lookup_invoice`) before the screen turns green and a voice says
  "payment received" in her language. No screenshot can fool her.
- **Merchant wallet built in** — balance, receive, history, connected to the
  merchant's *own* wallet through Nostr Wallet Connect (NWC). SatsPoint never
  holds the funds; permissions are limited and revocable.
- **Mobile money on the same screen** — PayTech (Wave, Orange Money, Free
  Money) with verified IPN callbacks. *Currently in PayTech test mode;
  production activation is pending with the provider.*
- **Owner dashboard, live** — owner, manager and cashier roles; every sale
  appears live on the owner's phone. Digital receipts shared on WhatsApp.

**A real mainnet payment was made and verified**: 100 FCFA = 265 sats, from
Wallet of Satoshi to the merchant's Coinos wallet (sale V-000001, shown in the
video).

## How we built it

- **Backend:** Laravel 12 (PHP 8.3) REST API, PostgreSQL, Laravel Reverb
  (WebSockets) for real-time signals that carry no data (screens reload through
  the API, with its access controls).
- **Frontend:** React 19 + TypeScript + Vite PWA, mobile-first, ~170 KB gzip
  for the till's first screen.
- **Lightning:** a dedicated gateway (Node, `@getalby/sdk`) speaking Nostr
  Wallet Connect (NIP-47) — `make_invoice`, `lookup_invoice`, `get_balance`,
  `list_transactions` — isolated on the internal network, authenticated with
  HMAC. Demo on **mainnet** with real sats.
- **Voice:** in-browser recording studio (burst mode, drag-and-drop of
  WhatsApp voice notes), server-side ffmpeg cleaning (silences trimmed, noise
  reduced, loudness levelled), content-addressed MP3s cached offline. 523 voice
  keys are generated from the code, so a new button can never stay silent.
- **Spoken price:** the browser's speech recognition (French) and our own
  parser for numbers in words and digits — it never guesses: nothing
  understood, nothing written.
- **One-command setup:** `docker compose up` starts everything with demo data;
  without any wallet it runs in a clearly labelled simulated mode.
- **Tests:** 428 backend tests (Pest), 248 frontend tests (Vitest), end-to-end
  journeys with Playwright on the real stack.

**Security by design:** non-custodial; NWC and PayTech secrets encrypted at
rest with a key separate from the app key, never sent to the browser; payment
status decided server-side only after re-verification; least privilege
(cashiers cannot see the balance; the platform admin never sees merchants'
money); two-factor authentication for the platform console; audit log of
sensitive actions; strict validation and rate limits; a written
[threat model](https://github.com/makaGit10/SatsPoint/blob/main/docs/THREAT_MODEL.md).

## Challenges we ran into

- **A wallet that never notifies:** during our first real mainnet payment, the
  sats arrived but the screen stayed on "waiting" — the wallet (Coinos) never
  sends NWC payment notifications. We now re-verify the invoice with the wallet
  every few seconds while the QR code is shown, so any NWC wallet works,
  notifications or not.
- **Designing for merchants who do not read:** voice everywhere, pictures
  instead of names, spoken prices — and a registry that makes every new button
  appear in the studio as "audio missing".
- **Rate volatility vs. invoice lifetime:** the rate is locked per invoice,
  invoices expire after five minutes and regenerate in one tap.
- **Rounding between FCFA and sats:** explicit rules guarantee the merchant
  always receives at least the displayed price.

## Accomplishments that we're proud of

- A real mainnet Lightning payment, verified server-side, on a phone.
- Real Wolof recordings throughout the selling journey — the merchant hears
  her own language, not a robot.
- Any language of any country can be added and recorded without a developer.
- Non-custodial architecture: merchants keep full control of their funds.

## What we learned

- Lightning's speed is a UX feature: instant settlement is exactly what
  merchants used to mobile money expect.
- Nostr Wallet Connect makes non-custodial integrations simple — but wallets
  differ, so never rely on notifications alone.
- Adoption depends less on Bitcoin itself than on speaking the merchant's
  language — FCFA, Wolof, "paid / not paid".

## What's next for SatsPoint

- **Off-ramp to mobile money** with a local partner (sats → FCFA on demand).
- **Record Serer, Pulaar and Jola**, then languages of other countries.
- **PayTech production activation** for mobile money.
- **Offline mode** over SMS/USSD confirmations.
- **Pilot:** 10 merchants in one Dakar neighbourhood, tracking weekly active
  merchants, payments per merchant, and the delay between settlement and green
  screen — published every week.

## Demo videos

- English: https://youtu.be/i93TtM1nols
- French (version française) : https://youtu.be/LayPRfuntFI
```

## Built with
```
bitcoin, lightning-network, nostr, nostr-wallet-connect, laravel, php, postgresql, react, typescript, vite, pwa, websockets, laravel-reverb, docker, frankenphp, paytech, ffmpeg, playwright
```

## Try it out links
- `https://satspoint.onrender.com`
- `https://github.com/makaGit10/SatsPoint` (rendre le dépôt **public** avant de soumettre)

## Video demo link
- Champ principal « Video demo link » (version anglaise) : `https://youtu.be/i93TtM1nols`
- Version française : `https://youtu.be/LayPRfuntFI` (déjà ajoutée à la fin du texte « About the project »)

Fichiers : `docs/videos/SatsPoint-EN.mp4`, `docs/videos/SatsPoint-FR.mp4` (2 min 59 chacune).
