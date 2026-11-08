import { pino, type Logger } from 'pino';

export type Journal = Logger;

/**
 * Chemins masqués dans toute ligne de journal : URI NWC (contiennent le secret),
 * secrets, preimages, factures complètes et signatures HMAC.
 */
const CHEMINS_MASQUES = [
  'uri',
  '*.uri',
  'secret',
  '*.secret',
  'preimage',
  '*.preimage',
  'bolt11',
  '*.bolt11',
  'invoice',
  '*.invoice',
  'nostrWalletConnectUrl',
  '*.nostrWalletConnectUrl',
  'req.headers["x-sp-signature"]',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function creerJournal(niveau: string = 'info', destination?: NodeJS.WritableStream): Journal {
  const options = {
    level: niveau,
    base: { service: 'lightning-gateway' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: CHEMINS_MASQUES, censor: '[masqué]' },
  };
  return destination ? pino(options, destination) : pino(options);
}

/** Les 8 premiers caractères d'un payment_hash : seul extrait autorisé dans les journaux. */
export function abregerHash(hash: string | undefined | null): string {
  if (!hash) return '-';
  return hash.slice(0, 8);
}
