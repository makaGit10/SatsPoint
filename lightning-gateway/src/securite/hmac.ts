import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Authentification mutuelle API ↔ passerelle (contrat § 1).
 *
 *   message   = timestamp + "." + nonce + "." + METHODE + "." + chemin_avec_query + "." + sha256hex(corps_brut)
 *   signature = hex( HMAC-SHA256( secret, message ) )
 *
 * Refus si signature invalide (comparaison à temps constant), |maintenant − timestamp| > 30 s,
 * ou nonce déjà vu dans les 5 dernières minutes.
 */

export const FENETRE_HORODATAGE_S = 30;
export const DUREE_NONCE_MS = 5 * 60 * 1000;

export const EN_TETES = {
  horodatage: 'x-sp-timestamp',
  nonce: 'x-sp-nonce',
  signature: 'x-sp-signature',
} as const;

const MOTIF_NONCE = /^[0-9a-f]{32,128}$/i; // ≥ 16 octets en hexadécimal
const MOTIF_HORODATAGE = /^\d{1,12}$/;
const MOTIF_SIGNATURE = /^[0-9a-f]{64}$/i;

export function sha256Hex(donnees: string | Uint8Array): string {
  return createHash('sha256').update(donnees).digest('hex');
}

export type ElementsMessage = {
  timestamp: string | number;
  nonce: string;
  methode: string;
  chemin: string;
  corps: string | Uint8Array;
};

export function construireMessage(e: ElementsMessage): string {
  return `${e.timestamp}.${e.nonce}.${e.methode.toUpperCase()}.${e.chemin}.${sha256Hex(e.corps)}`;
}

export function calculerSignature(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function genererNonce(): string {
  return randomBytes(16).toString('hex');
}

export type EnTetesSignes = {
  'X-SP-Timestamp': string;
  'X-SP-Nonce': string;
  'X-SP-Signature': string;
};

/** Produit les trois en-têtes à joindre à une requête sortante (vers l'API). */
export function signer(
  secret: string,
  requete: { methode: string; chemin: string; corps?: string | Uint8Array; timestamp?: number; nonce?: string },
): EnTetesSignes {
  const timestamp = requete.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = requete.nonce ?? genererNonce();
  const signature = calculerSignature(
    secret,
    construireMessage({ timestamp, nonce, methode: requete.methode, chemin: requete.chemin, corps: requete.corps ?? '' }),
  );
  return { 'X-SP-Timestamp': String(timestamp), 'X-SP-Nonce': nonce, 'X-SP-Signature': signature };
}

/** Mémoire des nonces vus, avec expiration (5 min) et capacité bornée. */
export class MagasinNonces {
  private readonly vus = new Map<string, number>();
  private dernierePurge = 0;

  constructor(
    private readonly dureeMs: number = DUREE_NONCE_MS,
    private readonly capaciteMax: number = 100_000,
  ) {}

  /** Enregistre le nonce et renvoie `true` s'il n'avait jamais été vu (dans la fenêtre). */
  consommer(nonce: string, maintenantMs: number = Date.now()): boolean {
    this.purger(maintenantMs);
    const cle = nonce.toLowerCase();
    const expiration = this.vus.get(cle);
    if (expiration !== undefined && expiration > maintenantMs) return false;
    if (this.vus.size >= this.capaciteMax) {
      // Capacité atteinte : on retire les plus anciens (ordre d'insertion de Map).
      const aSupprimer = Math.ceil(this.capaciteMax / 10);
      let n = 0;
      for (const k of this.vus.keys()) {
        this.vus.delete(k);
        if (++n >= aSupprimer) break;
      }
    }
    this.vus.set(cle, maintenantMs + this.dureeMs);
    return true;
  }

  purger(maintenantMs: number = Date.now()): void {
    if (maintenantMs - this.dernierePurge < 10_000 && this.vus.size < this.capaciteMax) return;
    this.dernierePurge = maintenantMs;
    for (const [k, exp] of this.vus) {
      if (exp <= maintenantMs) this.vus.delete(k);
    }
  }

  get taille(): number {
    return this.vus.size;
  }
}

export type RaisonRefus =
  | 'EN_TETE_MANQUANT'
  | 'HORODATAGE_INVALIDE'
  | 'HORODATAGE_PERIME'
  | 'NONCE_INVALIDE'
  | 'NONCE_REJOUE'
  | 'SIGNATURE_INVALIDE';

export type ResultatVerification = { ok: true } | { ok: false; raison: RaisonRefus };

export type RequeteAVerifier = {
  methode: string;
  chemin: string;
  corps: string | Uint8Array;
  enTetes: { timestamp?: string | undefined; nonce?: string | undefined; signature?: string | undefined };
};

export class VerificateurHmac {
  private readonly magasin: MagasinNonces;
  private readonly fenetreS: number;
  private readonly maintenant: () => number;

  constructor(
    private readonly secret: string,
    options: { magasin?: MagasinNonces; fenetreS?: number; maintenant?: () => number } = {},
  ) {
    if (!secret || secret.length < 16) throw new Error('Secret HMAC trop court');
    this.magasin = options.magasin ?? new MagasinNonces();
    this.fenetreS = options.fenetreS ?? FENETRE_HORODATAGE_S;
    this.maintenant = options.maintenant ?? Date.now;
  }

  verifier(r: RequeteAVerifier): ResultatVerification {
    const { timestamp, nonce, signature } = r.enTetes;
    if (!timestamp || !nonce || !signature) return { ok: false, raison: 'EN_TETE_MANQUANT' };
    if (!MOTIF_HORODATAGE.test(timestamp)) return { ok: false, raison: 'HORODATAGE_INVALIDE' };
    if (!MOTIF_NONCE.test(nonce)) return { ok: false, raison: 'NONCE_INVALIDE' };
    if (!MOTIF_SIGNATURE.test(signature)) return { ok: false, raison: 'SIGNATURE_INVALIDE' };

    const maintenantMs = this.maintenant();
    const ecartS = Math.abs(maintenantMs / 1000 - Number(timestamp));
    if (ecartS > this.fenetreS) return { ok: false, raison: 'HORODATAGE_PERIME' };

    const attendue = calculerSignature(
      this.secret,
      construireMessage({ timestamp, nonce, methode: r.methode, chemin: r.chemin, corps: r.corps }),
    );
    if (!comparerTempsConstant(attendue, signature.toLowerCase())) return { ok: false, raison: 'SIGNATURE_INVALIDE' };

    // Le nonce n'est consommé qu'après une signature valide : un tiers sans le secret
    // ne peut pas remplir la mémoire ni invalider les nonces légitimes.
    if (!this.magasin.consommer(nonce, maintenantMs)) return { ok: false, raison: 'NONCE_REJOUE' };
    return { ok: true };
  }
}

export function comparerTempsConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
