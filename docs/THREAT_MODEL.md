# SatsPoint — Threat Model

*Version 1.0 — November 2026. Method: STRIDE per component, then prioritised by likelihood × impact. Companion to the [specification](CAHIER_DES_CHARGES.md) (§13) and the [security directives](DIRECTIVES.md) (§2). Written in English because the jury is partly anglophone; the rest of the documentation is in French.*

## 1. What we protect

| Asset | Why it matters | Where it lives |
|---|---|---|
| **Merchant funds** | The merchant's sats. SatsPoint is **non-custodial**: it never holds keys or funds, but it holds a *capability* (the NWC connection) that can create invoices and, if allowed, spend within a budget. | Merchant's own wallet (Coinos, Alby Hub…) |
| **NWC connection secrets** | Whoever holds one can act on the wallet within its permissions and budget. | `connexions_wallet.uri_chiffree`, encrypted at rest; decrypted only in gateway memory |
| **PayTech API credentials** | Allow creating payment requests on the merchant's PayTech account and validating IPNs. | `comptes_paytech.*_chiffree`, encrypted at rest |
| **Payment truth** | "Paid / not paid" is the one decision the merchant relies on. | Server-side state machine on `ventes` / `paiements` |
| **Merchant and staff accounts** | Access to sales, settings, team; owner can send sats. | `users`, `membres`, sessions |
| **Sales data** | Business confidentiality between shops. | All `boutique_id`-scoped tables |
| **Voice assets** | Published to everyone; a malicious file would reach every device. | `audios`, object storage |

Customers paying at the till are **anonymous**: SatsPoint stores no customer PII by default.

## 2. Architecture and trust boundaries

```
 ┌──────────────── Untrusted: Internet ────────────────┐
 │  Merchant PWA (browser)      Customer wallet / phone │
 │  PayTech (IPN callbacks)     Nostr relays            │
 └───────────────┬─────────────────────┬────────────────┘
                 │ HTTPS (cookies, CSRF)│ wss (NIP-47, encrypted)
 ┌───────────────▼─────────────────────▼─ Trusted: our containers ─┐
 │ Caddy ──► Laravel API ◄── HMAC ──► Lightning gateway            │
 │              │  ▲                        (internal network only) │
 │   PostgreSQL ┘  └ Redis   Reverb (WebSocket, signals only)      │
 └────────────────────────────────────────────────────────────────┘
```

Trust boundaries: (B1) browser ↔ API, (B2) PayTech ↔ API webhook, (B3) Nostr relay ↔ gateway, (B4) API ↔ gateway (internal, HMAC), (B5) super-admin ↔ platform console.

## 3. Assumptions

- The merchant's wallet provider (e.g. Coinos) is trusted to execute NWC methods honestly. We cannot protect against a malicious wallet provider.
- The relay cannot read NIP-47 payloads (NIP-04/NIP-44 encryption), but can delay or drop them. We treat the relay as untrusted for availability.
- The deployment host, Docker images and PostgreSQL are trusted. Backups are encrypted.
- Exchange-rate sources may be wrong or unavailable; we never trust a single source.

## 4. Threats and mitigations (STRIDE)

Severity: 🔴 high · 🟠 medium · 🟡 low. Status: ✅ implemented in MVP · 🔜 planned (noted in spec).

### 4.1 Payment truth (B1, B2, B3)

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T1 | Customer shows a **fake "paid" screen** or screenshot | Spoofing | 🔴 | Only the merchant's SatsPoint screen is authoritative. Payment status is decided **server-side** after `lookup_invoice` confirms settlement for the exact `payment_hash`; the client cannot set a status. | ✅ |
| T2 | **Forged PayTech IPN** marks a sale paid | Spoofing / Tampering | 🔴 | IPN authenticity verified (HMAC / key hashes), amount + currency + `ref_command` re-checked, boutique resolved from our own record (not from the payload), idempotent processing, invalid IPNs answered `200` without effect and logged. | ✅ |
| T3 | **Replay** of a valid IPN or Lightning event | Tampering | 🟠 | `evenements_paiement` unique on (source, payload fingerprint); state transitions in a DB transaction with `SELECT … FOR UPDATE`. | ✅ |
| T4 | Gateway notification claims a payment that did not happen | Spoofing | 🔴 | API treats gateway events as *hints*: it re-verifies via `lookup_invoice` before any state change. Gateway calls are HMAC-signed with timestamp + nonce. | ✅ |
| T5 | **Rate manipulation** (customer pays fewer sats than the FCFA price) | Tampering | 🟠 | Rate = median of 3 sources, outliers >2 % discarded, rate **frozen per invoice**, rounding **up** to the next sat, short invoice expiry; Lightning disabled if no rate <10 min old. | ✅ |
| T6 | Two payments for one sale (race) | Integrity | 🟡 | Sale locked during transitions; second success recorded and flagged **"overpayment"** to the owner — never silently lost. | ✅ |
| T7 | Payment arrives after cancellation / expiry | Integrity | 🟡 | Sale re-marked `payee` with a flag + alert; received money is never ignored. | ✅ |

### 4.2 Merchant funds and NWC (B3, B4)

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T8 | **Database leak exposes NWC secrets** | Information disclosure | 🔴 | AES-256-GCM encryption with `DATA_ENCRYPTION_KEY` (separate from `APP_KEY`), never returned by the API (front only sees connected/not), revocable in one click; merchants are told to set **minimal permissions** and a **spending budget** on the wallet side. | ✅ |
| T9 | **Cashier drains the wallet** | Elevation of privilege | 🔴 | `pay_invoice` is owner-only, requires re-authentication, shows a preview, and is capped by the NWC budget. Cashiers cannot see the balance. | ✅ |
| T10 | Compromised API server abuses stored connections | Elevation | 🔴 | Budget and permissions enforced by the **wallet**, not by us (defence in depth); gateway on internal network only; send capability disabled by default. | ✅ |
| T11 | Replay / forgery of API ↔ gateway calls | Spoofing | 🟠 | HMAC-SHA256 over method + path + body hash, 30 s timestamp window, nonce cache, constant-time compare, shared secret from env only. | ✅ |
| T12 | Relay outage or censorship | Denial of service | 🟠 | 15 s timeouts, clear error + fallback to mobile money, wallet-provided relay; future: multiple relays. | ✅ / 🔜 |
| T13 | Gateway logs leak secrets / preimages | Information disclosure | 🟠 | Pino redaction of URIs, secrets, preimages; only 8-char payment-hash prefixes logged. | ✅ |

### 4.3 Accounts and access (B1)

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T14 | **IDOR**: read/modify another shop's sale by changing an id | Elevation / Disclosure | 🔴 | Opaque ULIDs, Laravel Policies on every route, a **global boutique scope** on all business models, and an automated test that sweeps every authenticated route with a foreign-shop user (expects 403/404). | ✅ |
| T15 | Credential stuffing / brute force | Spoofing | 🟠 | Rate limits (5/min per identifier, 20/min per IP, progressive lock-out), 12-char minimum + breached-password check, generic error messages, 2FA for super-admin (owners optional). | ✅ |
| T16 | Session theft via XSS | Spoofing | 🟠 | HttpOnly + Secure + SameSite=Lax session cookies, no tokens in `localStorage`, strict CSP, React escaping, no `dangerouslySetInnerHTML`. | ✅ |
| T17 | CSRF on state-changing routes | Tampering | 🟠 | Sanctum SPA CSRF token + SameSite cookies; CORS allow-list of explicit origins, tested before each deploy. | ✅ |
| T18 | Deactivated staff keeps access | Elevation | 🟡 | Deactivation revokes all sessions immediately; membership checked on every request (not cached in the session). | ✅ |
| T19 | Invitation link guessed or reused | Spoofing | 🟡 | 256-bit random token stored hashed, single use, 72 h expiry. | ✅ |

### 4.4 Platform console and voice assets (B5)

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T20 | Super-admin account takeover → malicious audio pushed to every device | Elevation / Tampering | 🔴 | Mandatory TOTP 2FA, rate limits, audit log; uploaded files type-checked by signature (not extension), **always re-encoded by ffmpeg** with fixed parameters and a time limit, size ≤ 2 MB, server-generated filenames, content-addressed URLs. | ✅ |
| T21 | Super-admin reads merchants' money data | Information disclosure | 🟠 | Least privilege: the platform role has **no access** to other shops' sales, wallets or PayTech data — only shop status, health and audio. The super-admin may own **one shop of their own**, reached through an ordinary owner membership (data access always goes through membership + `BoutiqueScope`, never through the platform role); a Pest test checks they still only see that shop. | ✅ |
| T22 | Audio manifest poisoning (cache) | Tampering | 🟡 | Manifest served by our API with short cache + ETag; files immutable and hash-named. | ✅ |

### 4.5 Availability and abuse

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T23 | Invoice-creation flood (hurts merchant wallet and our gateway) | DoS | 🟠 | 30 invoices/min per user, amounts bounded, expired invoices garbage-collected. | ✅ |
| T24 | Webhook flood | DoS | 🟡 | 60/min per shop, cheap rejection path before any DB work. | ✅ |
| T25 | Public receipt enumeration | Information disclosure | 🟡 | 32-char random receipt tokens, 60/min per IP, receipts contain no customer PII. | ✅ |
| T26 | Dependency vulnerabilities | Tampering | 🟠 | Lockfiles, `composer audit` + `npm audit` in CI, weekly security updates. | ✅ |

### 4.6 Privacy

| # | Threat | Category | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T27 | PII in logs | Information disclosure | 🟠 | Log scrubbing (no phone, email, invoice, secret); automated test asserts a login attempt writes no PII. | ✅ |
| T28 | Customer tracking | Privacy | 🟡 | No customer identity collected; receipts optional and anonymous; no third-party analytics in the merchant app. | ✅ |

## 5. Residual risks (accepted for the MVP)

1. **Custodial wallet provider risk** (e.g. Coinos) is outside SatsPoint's control; merchants are guided towards non-custodial NWC wallets (Alby Hub) and small balances.
2. **Single relay dependency** per wallet connection; mitigated by fallback to mobile money, multi-relay planned.
3. **PayTech test mode** during the hackathon: real mobile-money settlement requires account activation by PayTech.
4. **Free-tier hosting** (Render) may sleep; mitigated by uptime pings during judging. Not a security issue, noted for transparency.

## 6. Verification

| Control | How it is verified |
|---|---|
| Authorisation & IDOR | Pest test sweeping every route with foreign-shop users |
| Payment state machine | Unit tests on transitions, replay and race scenarios |
| HMAC | Tests: valid / expired / replayed / forged |
| Headers, CORS | Tests on responses; manual check before deploy |
| Secrets never exposed | Tests asserting absence of fields in API Resources |
| PII-free logs | Test capturing the log channel during authentication |
| Dependencies | `composer audit`, `npm audit` in CI |
| Real-money path | Manual scripted check with 100 FCFA on mainnet before each production deploy |

## 7. Reporting a vulnerability

Please e-mail the maintainer (address in the repository profile) with steps to reproduce. We aim to acknowledge within 48 hours and to fix confirmed high-severity issues before any further public release.
