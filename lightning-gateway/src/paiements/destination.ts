import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { bech32 } from '@scure/base';
import { z } from 'zod';
import { erreur } from '../erreurs.js';
import { decoderBolt11, factureExpiree, ressembleABolt11, type Bolt11Decodee, type ReseauBolt11 } from '../portefeuilles/bolt11.js';
import type { ApercuPaiement } from '../portefeuilles/types.js';

/**
 * Résolution d'une destination de paiement : facture BOLT11, adresse Lightning (LUD-16)
 * ou LNURL-pay (LUD-06). Implémentation directe et bornée : HTTPS uniquement, délai 10 s,
 * réponse ≤ 64 Ko, hôtes privés refusés (anti-SSRF), validation zod de chaque réponse,
 * et vérification que la facture renvoyée correspond au montant demandé.
 */

export type OptionsResolution = {
  /** Réseaux BOLT11 acceptés pour ce portefeuille (ex. `['bc']` pour un vrai portefeuille). */
  reseauxAutorises: readonly ReseauBolt11[];
  /** Tests uniquement : autorise `http://` et les hôtes locaux. */
  autoriserHttpLocal?: boolean;
  delaiMs?: number;
  fetchImpl?: typeof fetch;
};

export type ResolutionBolt11 = { type: 'bolt11'; decode: Bolt11Decodee };
export type ResolutionLnurl = {
  type: 'adresse' | 'lnurl';
  callback: string;
  min_msats: number;
  max_msats: number;
  description: string | undefined;
  destinataire: string;
  metadata: string;
  commentaire_max: number;
};
export type Resolution = ResolutionBolt11 | ResolutionLnurl;

const LONGUEUR_MAX_DESTINATION = 4_096;
const TAILLE_MAX_REPONSE = 64 * 1024;
const MOTIF_ADRESSE = /^[a-z0-9._%+-]{1,64}@([a-z0-9-]+\.)+[a-z]{2,63}$/i;
const MOTIF_ADRESSE_LOCALE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]+(:\d{1,5})?$/i;
const MOTIF_LNURL = /^lnurl1[02-9ac-hj-np-z]{6,}$/i;

const schemaPayRequest = z.object({
  tag: z.literal('payRequest'),
  callback: z.string().min(1).max(2048),
  minSendable: z.number().int().positive(),
  maxSendable: z.number().int().positive(),
  metadata: z.string().min(2).max(TAILLE_MAX_REPONSE),
  commentAllowed: z.number().int().nonnegative().optional(),
});

const schemaErreurLnurl = z.object({ status: z.literal('ERROR'), reason: z.string().max(500).optional() });

const schemaFactureLnurl = z.object({
  pr: z.string().min(1).max(4096),
  routes: z.array(z.unknown()).optional(),
});

export async function resoudreDestination(destinationBrute: string, options: OptionsResolution): Promise<Resolution> {
  const destination = destinationBrute.trim();
  if (!destination || destination.length > LONGUEUR_MAX_DESTINATION) {
    throw erreur('DESTINATION_INVALIDE', 'Destination vide ou trop longue');
  }

  if (ressembleABolt11(destination)) {
    const decode = decoderBolt11(destination);
    if (!options.reseauxAutorises.includes(decode.reseau)) {
      throw erreur('FACTURE_INVALIDE', 'Réseau de la facture non pris en charge par ce portefeuille');
    }
    if (factureExpiree(decode)) throw erreur('FACTURE_INVALIDE', 'Facture expirée');
    return { type: 'bolt11', decode };
  }

  let url: URL;
  let type: 'adresse' | 'lnurl';
  let destinataire: string;

  const sansPrefixe = destination.replace(/^lightning:/i, '');
  if (MOTIF_ADRESSE.test(sansPrefixe) || (options.autoriserHttpLocal && MOTIF_ADRESSE_LOCALE.test(sansPrefixe))) {
    const [nom, domaine] = sansPrefixe.split('@') as [string, string];
    const schema = options.autoriserHttpLocal && estHoteLocal(domaine.split(':')[0] ?? '') ? 'http' : 'https';
    url = new URL(`${schema}://${domaine.toLowerCase()}/.well-known/lnurlp/${encodeURIComponent(nom)}`);
    type = 'adresse';
    destinataire = `${nom}@${domaine.toLowerCase()}`;
  } else if (MOTIF_LNURL.test(sansPrefixe)) {
    url = decoderLnurl(sansPrefixe);
    type = 'lnurl';
    destinataire = url.host;
  } else if (/^lnurlp:\/\//i.test(sansPrefixe)) {
    url = analyserUrl(sansPrefixe.replace(/^lnurlp:\/\//i, 'https://'));
    type = 'lnurl';
    destinataire = url.host;
  } else if (/^https?:\/\//i.test(sansPrefixe)) {
    url = analyserUrl(sansPrefixe);
    type = 'lnurl';
    destinataire = url.host;
  } else {
    throw erreur('DESTINATION_INVALIDE', 'Destination non reconnue (facture BOLT11, adresse Lightning ou LNURL attendue)');
  }

  verifierUrlExterne(url, options);
  const brut = await lireJson(url, options);
  if (schemaErreurLnurl.safeParse(brut).success) {
    throw erreur('DESTINATION_INVALIDE', 'Le service de la destination a répondu par une erreur');
  }
  const r = schemaPayRequest.safeParse(brut);
  if (!r.success) throw erreur('DESTINATION_INVALIDE', 'Réponse LNURL-pay invalide');
  const donnees = r.data;
  if (donnees.minSendable > donnees.maxSendable) throw erreur('DESTINATION_INVALIDE', 'Bornes LNURL incohérentes');
  const callback = analyserUrl(donnees.callback);
  verifierUrlExterne(callback, options);

  const meta = lireMetadata(donnees.metadata);
  return {
    type,
    callback: callback.toString(),
    min_msats: donnees.minSendable,
    max_msats: donnees.maxSendable,
    description: meta.description,
    destinataire: meta.identifiant ?? destinataire,
    metadata: donnees.metadata,
    commentaire_max: donnees.commentAllowed ?? 0,
  };
}

/** Demande une facture au service LNURL-pay pour le montant voulu et la vérifie. */
export async function obtenirFactureLnurl(
  resolution: ResolutionLnurl,
  montantMsats: number,
  options: OptionsResolution,
): Promise<Bolt11Decodee> {
  if (!Number.isSafeInteger(montantMsats) || montantMsats <= 0) {
    throw erreur('ENTREE_INVALIDE', 'montant_msats doit être un entier positif');
  }
  if (montantMsats < resolution.min_msats || montantMsats > resolution.max_msats) {
    throw erreur(
      'DESTINATION_INVALIDE',
      `Montant hors bornes : entre ${resolution.min_msats} et ${resolution.max_msats} msats`,
    );
  }
  const url = new URL(resolution.callback);
  url.searchParams.set('amount', String(montantMsats));
  verifierUrlExterne(url, options);
  const brut = await lireJson(url, options);
  if (schemaErreurLnurl.safeParse(brut).success) {
    throw erreur('DESTINATION_INVALIDE', 'Le service de la destination a refusé de produire une facture');
  }
  const r = schemaFactureLnurl.safeParse(brut);
  if (!r.success) throw erreur('DESTINATION_INVALIDE', 'Facture LNURL invalide');
  const decode = decoderBolt11(r.data.pr);
  if (!options.reseauxAutorises.includes(decode.reseau)) {
    throw erreur('DESTINATION_INVALIDE', 'La facture reçue n’est pas sur le bon réseau');
  }
  if (decode.montant_msats !== montantMsats) {
    throw erreur('DESTINATION_INVALIDE', 'La facture reçue ne correspond pas au montant demandé');
  }
  if (factureExpiree(decode)) throw erreur('DESTINATION_INVALIDE', 'La facture reçue est déjà expirée');
  if (decode.description_hash !== undefined) {
    const attendu = createHash('sha256').update(resolution.metadata, 'utf8').digest('hex');
    if (decode.description_hash !== attendu) {
      throw erreur('DESTINATION_INVALIDE', 'La facture reçue ne correspond pas à la destination (description_hash)');
    }
  }
  return decode;
}

export function apercuDepuisResolution(res: Resolution, montantDemande: number | undefined): ApercuPaiement {
  if (res.type === 'bolt11') {
    const d = res.decode;
    const montant = d.montant_msats ?? montantDemande;
    if (montant === undefined) throw erreur('FACTURE_INVALIDE', 'Facture sans montant : montant_msats est requis');
    if (d.montant_msats !== null && montantDemande !== undefined && montantDemande !== d.montant_msats) {
      throw erreur('FACTURE_INVALIDE', 'Le montant demandé diffère du montant de la facture');
    }
    const apercu: ApercuPaiement = {
      type: 'bolt11',
      bolt11: d.bolt11,
      montant_msats: montant,
      payment_hash: d.payment_hash,
      expire_le: new Date(d.expire_le_s * 1000).toISOString(),
    };
    if (d.description !== undefined) apercu.description = d.description;
    return apercu;
  }
  const apercu: ApercuPaiement = {
    type: res.type,
    montant_msats: montantDemande ?? 0,
    destinataire: res.destinataire,
    min_msats: res.min_msats,
    max_msats: res.max_msats,
  };
  if (res.description !== undefined) apercu.description = res.description;
  return apercu;
}

// ---------------------------------------------------------------------------

function decoderLnurl(lnurl: string): URL {
  try {
    const { words } = bech32.decode(lnurl.toLowerCase() as `${string}1${string}`, 2048);
    const octets = bech32.fromWords(words);
    return analyserUrl(Buffer.from(octets).toString('utf8'));
  } catch (e) {
    if (e instanceof Error && e.name === 'ErreurPasserelle') throw e;
    throw erreur('DESTINATION_INVALIDE', 'LNURL indéchiffrable');
  }
}

function analyserUrl(s: string): URL {
  try {
    return new URL(s);
  } catch {
    throw erreur('DESTINATION_INVALIDE', 'URL de destination invalide');
  }
}

function estHoteLocal(hote: string): boolean {
  const h = hote.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const version = isIP(h);
  if (version === 4) {
    const [a = 0, b = 0] = h.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  }
  return false;
}

/** Refuse les hôtes privés / locaux et tout schéma autre que HTTPS (sauf en test local explicite). */
function verifierUrlExterne(url: URL, options: OptionsResolution): void {
  if (options.autoriserHttpLocal) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw erreur('DESTINATION_INVALIDE', 'Schéma non autorisé');
    return;
  }
  if (url.protocol !== 'https:') throw erreur('DESTINATION_INVALIDE', 'Seules les destinations HTTPS sont acceptées');
  if (url.username || url.password) throw erreur('DESTINATION_INVALIDE', 'URL avec identifiants refusée');
  if (!url.hostname.includes('.') || estHoteLocal(url.hostname)) {
    throw erreur('DESTINATION_INVALIDE', 'Hôte de destination non autorisé');
  }
}

async function lireJson(url: URL, options: OptionsResolution): Promise<unknown> {
  const f = options.fetchImpl ?? fetch;
  let reponse: Response;
  try {
    reponse = await f(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(options.delaiMs ?? 10_000),
    });
  } catch {
    throw erreur('DESTINATION_INVALIDE', 'Service de la destination injoignable');
  }
  if (!reponse.ok) throw erreur('DESTINATION_INVALIDE', `Service de la destination indisponible (${reponse.status})`);
  const longueur = Number(reponse.headers.get('content-length') ?? '0');
  if (longueur > TAILLE_MAX_REPONSE) throw erreur('DESTINATION_INVALIDE', 'Réponse de la destination trop volumineuse');
  const texte = await reponse.text();
  if (texte.length > TAILLE_MAX_REPONSE) throw erreur('DESTINATION_INVALIDE', 'Réponse de la destination trop volumineuse');
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    throw erreur('DESTINATION_INVALIDE', 'Réponse de la destination illisible');
  }
}

function lireMetadata(metadata: string): { description: string | undefined; identifiant: string | undefined } {
  let liste: unknown;
  try {
    liste = JSON.parse(metadata);
  } catch {
    throw erreur('DESTINATION_INVALIDE', 'Métadonnées LNURL illisibles');
  }
  const r = z.array(z.tuple([z.string()]).rest(z.string())).safeParse(liste);
  if (!r.success) throw erreur('DESTINATION_INVALIDE', 'Métadonnées LNURL invalides');
  let description: string | undefined;
  let identifiant: string | undefined;
  for (const [cle, valeur] of r.data) {
    if (cle === 'text/plain' && description === undefined && valeur !== undefined) description = valeur.slice(0, 640);
    if (cle === 'text/identifier' && identifiant === undefined && valeur !== undefined) identifiant = valeur.slice(0, 320);
  }
  return { description, identifiant };
}
