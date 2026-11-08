import { createRequire } from 'node:module';
import { erreur } from '../erreurs.js';

// `light-bolt11-decoder` est publié en CommonJS sans champ `exports` : chargement via require.
const require = createRequire(import.meta.url);
type DecodeurLeger = { decode(facture: string): DecodageBrut };
type SectionBrute = { name: string; value?: unknown; letters?: string };
type DecodageBrut = { paymentRequest: string; sections: SectionBrute[]; expiry: number };
const decodeurLeger = require('light-bolt11-decoder') as DecodeurLeger;

export const LONGUEUR_MAX_BOLT11 = 4_096;

export type ReseauBolt11 = 'bc' | 'tb' | 'tbs' | 'bcrt' | 'sb';

export type Bolt11Decodee = {
  bolt11: string;
  reseau: ReseauBolt11;
  payment_hash: string;
  /** `null` si la facture ne fixe pas de montant. */
  montant_msats: number | null;
  description: string | undefined;
  description_hash: string | undefined;
  horodatage_s: number;
  expiration_s: number;
  expire_le_s: number;
};

const MOTIF_BOLT11 = /^ln(bc|tb|tbs|bcrt|sb)[0-9a-z]*1[02-9ac-hj-np-z]+$/;
/** Détection large : tout ce qui commence comme une facture est traité comme telle (puis validé strictement). */
const MOTIF_PREFIXE_BOLT11 = /^ln(bc|tb|tbs|bcrt|sb)[0-9a-z]+$/;
const MOTIF_HEX64 = /^[0-9a-f]{64}$/;

/** Enlève un éventuel préfixe `lightning:` et normalise en minuscules. */
export function normaliserBolt11(entree: string): string {
  let s = entree.trim();
  if (/^lightning:/i.test(s)) s = s.slice('lightning:'.length);
  return s.toLowerCase();
}

export function ressembleABolt11(entree: string): boolean {
  const s = normaliserBolt11(entree);
  return s.length <= LONGUEUR_MAX_BOLT11 && MOTIF_PREFIXE_BOLT11.test(s);
}

/** Décode et vérifie la structure d'une facture BOLT11 (checksum bech32, hash, montant, expiration). */
export function decoderBolt11(entree: string): Bolt11Decodee {
  const bolt11 = normaliserBolt11(entree);
  if (bolt11.length > LONGUEUR_MAX_BOLT11 || !MOTIF_BOLT11.test(bolt11)) {
    throw erreur('FACTURE_INVALIDE', 'Facture BOLT11 mal formée');
  }
  let brut: DecodageBrut;
  try {
    brut = decodeurLeger.decode(bolt11);
  } catch {
    throw erreur('FACTURE_INVALIDE', 'Facture BOLT11 indéchiffrable');
  }
  const sections = new Map<string, unknown>();
  for (const s of brut.sections) sections.set(s.name, s.value);

  const reseau = (sections.get('coin_network') as { bech32?: string } | undefined)?.bech32;
  if (reseau !== 'bc' && reseau !== 'tb' && reseau !== 'tbs' && reseau !== 'bcrt' && reseau !== 'sb') {
    throw erreur('FACTURE_INVALIDE', 'Réseau de la facture inconnu');
  }
  const paymentHash = sections.get('payment_hash');
  if (typeof paymentHash !== 'string' || !MOTIF_HEX64.test(paymentHash)) {
    throw erreur('FACTURE_INVALIDE', 'Facture sans payment_hash valide');
  }
  const montantBrut = sections.get('amount');
  let montant: number | null = null;
  if (montantBrut !== undefined) {
    if (typeof montantBrut !== 'string' || !/^\d+$/.test(montantBrut)) {
      throw erreur('FACTURE_INVALIDE', 'Montant de la facture illisible');
    }
    const n = Number(montantBrut);
    if (!Number.isSafeInteger(n) || n <= 0) throw erreur('FACTURE_INVALIDE', 'Montant de la facture hors bornes');
    montant = n;
  }
  const horodatage = sections.get('timestamp');
  if (typeof horodatage !== 'number' || !Number.isFinite(horodatage)) {
    throw erreur('FACTURE_INVALIDE', 'Facture sans horodatage');
  }
  const expiration = typeof brut.expiry === 'number' && brut.expiry > 0 ? brut.expiry : 3600;
  const description = sections.get('description');
  const descriptionHash = sections.get('purpose_commit_hash') ?? sections.get('description_hash');

  return {
    bolt11,
    reseau,
    payment_hash: paymentHash,
    montant_msats: montant,
    description: typeof description === 'string' ? description : undefined,
    description_hash: typeof descriptionHash === 'string' ? descriptionHash : undefined,
    horodatage_s: horodatage,
    expiration_s: expiration,
    expire_le_s: horodatage + expiration,
  };
}

export function factureExpiree(d: Bolt11Decodee, maintenantS: number = Math.floor(Date.now() / 1000)): boolean {
  return d.expire_le_s <= maintenantS;
}
