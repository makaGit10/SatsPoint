import { nwc, type TypesNwc } from './alby.js';
import { erreur, estErreurPasserelle, type CodeErreur } from '../erreurs.js';
import { abregerHash, type Journal } from '../journal.js';
import {
  apercuDepuisResolution,
  obtenirFactureLnurl,
  resoudreDestination,
  type OptionsResolution,
} from '../paiements/destination.js';
import { avecDelai } from '../utils/delai.js';
import { decoderBolt11, type ReseauBolt11 } from './bolt11.js';
import {
  isoDepuisSecondes,
  type ApercuPaiement,
  type DemandeFacture,
  type DemandePaiement,
  type EcouteurNotification,
  type Facture,
  type FactureCreee,
  type FiltreTransactions,
  type InfoPortefeuille,
  type Portefeuille,
  type ResultatPaiement,
  type Transaction,
} from './types.js';

/** Un vrai portefeuille : mainnet uniquement (SatsPoint manipule de l'argent réel). */
const RESEAUX_NWC: readonly ReseauBolt11[] = ['bc'];

export type OptionsNwc = {
  delaiMs: number;
  journal: Journal;
  resolution?: Partial<OptionsResolution>;
};

type TransactionNip47 = TypesNwc.Nip47Transaction;

/**
 * Portefeuille du commerçant joint par Nostr Wallet Connect (NIP-47) via `@getalby/sdk`.
 * Chaque instance possède sa propre connexion au relais : un portefeuille injoignable
 * ne bloque pas les autres. Tous les appels sont bornés à `delaiMs` (15 s par contrat).
 */
export class PortefeuilleNwc implements Portefeuille {
  readonly mock = false;
  private readonly client: TypesNwc.NWCClient;
  private readonly relais: string;
  private methodes: Set<string> | undefined;
  private desabonnements: Array<() => void> = [];

  constructor(
    uri: string,
    private readonly options: OptionsNwc,
  ) {
    const analyse = PortefeuilleNwc.analyserUri(uri);
    this.relais = analyse.relais;
    this.client = new nwc.NWCClient({ nostrWalletConnectUrl: uri });
  }

  /** Valide la forme d'une URI NWC sans rien journaliser de son contenu. */
  static analyserUri(uri: string): { pubkey: string; relais: string } {
    if (typeof uri !== 'string' || uri.length > 4096) throw erreur('URI_INVALIDE');
    if (!/^(nostr\+walletconnect|nostrwalletconnect):\/\//i.test(uri)) {
      throw erreur('URI_INVALIDE', 'L’URI doit commencer par nostr+walletconnect://');
    }
    let options: TypesNwc.NWCOptions;
    try {
      options = nwc.NWCClient.parseWalletConnectUrl(uri);
    } catch {
      throw erreur('URI_INVALIDE', 'URI NWC illisible');
    }
    if (!/^[0-9a-f]{64}$/i.test(options.walletPubkey)) throw erreur('URI_INVALIDE', 'Clé publique du portefeuille invalide');
    if (!options.secret || !/^[0-9a-f]{64}$/i.test(options.secret)) throw erreur('URI_INVALIDE', 'Secret de connexion invalide');
    let relais: URL;
    try {
      relais = new URL(options.relayUrl);
    } catch {
      throw erreur('URI_INVALIDE', 'Adresse du relais invalide');
    }
    if (relais.protocol !== 'wss:' && relais.protocol !== 'ws:') throw erreur('URI_INVALIDE', 'Le relais doit être en ws:// ou wss://');
    return { pubkey: options.walletPubkey.toLowerCase(), relais: relais.toString() };
  }

  private async appel<T>(operation: string, f: () => Promise<T>): Promise<T> {
    try {
      return await avecDelai(f(), this.options.delaiMs, operation);
    } catch (e) {
      throw traduireErreurNwc(e, operation);
    }
  }

  private exiger(methode: string): void {
    if (this.methodes && !this.methodes.has(methode)) {
      throw erreur('PERMISSION_MANQUANTE', `Le portefeuille n’autorise pas « ${methode} »`);
    }
  }

  async getInfo(): Promise<InfoPortefeuille> {
    const info = await this.appel('get_info', () => this.client.getInfo());
    let notifications = Array.isArray(info.notifications) ? info.notifications : undefined;
    if (!notifications) {
      // Certains portefeuilles n'annoncent les notifications que dans l'événement 13194.
      try {
        const service = await this.appel('info du service', () => this.client.getWalletServiceInfo());
        notifications = service.notifications;
      } catch {
        notifications = [];
      }
    }
    const methods = (info.methods ?? []).map(String);
    this.methodes = new Set(methods);
    const resultat: InfoPortefeuille = {
      pubkey: this.client.walletPubkey,
      relais: [this.relais],
      alias: typeof info.alias === 'string' ? info.alias.slice(0, 120) : '',
      methods,
      notifications: notifications.map(String),
      mock: false,
    };
    const lud16 = this.client.lud16 ?? info.lud16;
    if (typeof lud16 === 'string' && lud16.length <= 320) resultat.lud16 = lud16;
    return resultat;
  }

  async makeInvoice(d: DemandeFacture): Promise<FactureCreee> {
    this.exiger('make_invoice');
    const tx = await this.appel('make_invoice', () =>
      this.client.makeInvoice({ amount: d.montant_msats, description: d.description, expiry: d.expiration_s }),
    );
    const decode = decoderBolt11(tx.invoice);
    const creeLeS = tx.created_at || decode.horodatage_s;
    const expireLeS = tx.expires_at || creeLeS + d.expiration_s;
    const paymentHash = tx.payment_hash || decode.payment_hash;
    this.options.journal.info({ hash: abregerHash(paymentHash), montant_msats: d.montant_msats }, 'facture créée (NWC)');
    return {
      bolt11: tx.invoice,
      payment_hash: paymentHash,
      montant_msats: tx.amount || d.montant_msats,
      cree_le: isoDepuisSecondes(creeLeS),
      expire_le: isoDepuisSecondes(expireLeS),
    };
  }

  async lookupInvoice(paymentHash: string): Promise<Facture> {
    this.exiger('lookup_invoice');
    const tx = await this.appel('lookup_invoice', () => this.client.lookupInvoice({ payment_hash: paymentHash }));
    return factureDepuisTransaction(tx, paymentHash);
  }

  async getBalance(): Promise<{ msats: number }> {
    this.exiger('get_balance');
    const r = await this.appel('get_balance', () => this.client.getBalance());
    if (!Number.isSafeInteger(r.balance) || r.balance < 0) throw erreur('INTERNE', 'Solde renvoyé invalide');
    return { msats: r.balance };
  }

  async listTransactions(f: FiltreTransactions): Promise<Transaction[]> {
    this.exiger('list_transactions');
    const requete: TypesNwc.Nip47ListTransactionsRequest = { limit: f.limite, offset: f.decalage };
    if (f.type) requete.type = f.type === 'entrante' ? 'incoming' : 'outgoing';
    const r = await this.appel('list_transactions', () => this.client.listTransactions(requete));
    return (r.transactions ?? []).map(transactionNormalisee);
  }

  async payInvoice(d: DemandePaiement): Promise<ResultatPaiement> {
    this.exiger('pay_invoice');
    const decode = decoderBolt11(d.bolt11);
    if (!RESEAUX_NWC.includes(decode.reseau)) throw erreur('FACTURE_INVALIDE', 'Seules les factures mainnet sont payables');
    const montant = decode.montant_msats ?? d.montant_msats;
    if (montant === undefined) throw erreur('FACTURE_INVALIDE', 'Facture sans montant : montant_msats est requis');
    const requete: TypesNwc.Nip47PayInvoiceRequest = { invoice: decode.bolt11 };
    if (decode.montant_msats === null) requete.amount = montant;
    const r = await this.appel('pay_invoice', () => this.client.payInvoice(requete));
    if (typeof r.preimage !== 'string' || !/^[0-9a-f]{64}$/i.test(r.preimage)) {
      throw erreur('PAIEMENT_ECHOUE', 'Le portefeuille n’a pas renvoyé de preuve de paiement');
    }
    return {
      payment_hash: decode.payment_hash,
      preimage: r.preimage,
      frais_msats: Number.isSafeInteger(r.fees_paid) && r.fees_paid >= 0 ? r.fees_paid : 0,
      montant_msats: montant,
    };
  }

  async apercuPaiement(d: { destination: string; montant_msats?: number }): Promise<ApercuPaiement> {
    const res = await resoudreDestination(d.destination, this.optionsResolution());
    return apercuDepuisResolution(res, d.montant_msats);
  }

  /** Résout une destination (adresse / LNURL) en facture BOLT11 prête à payer. */
  async resoudreEnBolt11(destination: string, montantMsats: number): Promise<{ bolt11: string; montant_msats: number }> {
    const res = await resoudreDestination(destination, this.optionsResolution());
    if (res.type === 'bolt11') {
      const montant = res.decode.montant_msats ?? montantMsats;
      return { bolt11: res.decode.bolt11, montant_msats: montant };
    }
    const facture = await obtenirFactureLnurl(res, montantMsats, this.optionsResolution());
    return { bolt11: facture.bolt11, montant_msats: montantMsats };
  }

  async onNotification(ecouteur: EcouteurNotification): Promise<() => void> {
    const desabonner = await this.client.subscribeNotifications(
      (n) => {
        if (n.notification_type !== 'payment_received' && n.notification_type !== 'payment_sent') return;
        const tx = n.notification;
        if (typeof tx?.payment_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(tx.payment_hash)) return;
        if (!Number.isSafeInteger(tx.amount) || tx.amount < 0) return;
        const notif: Parameters<EcouteurNotification>[0] = {
          type: n.notification_type,
          payment_hash: tx.payment_hash.toLowerCase(),
          montant_msats: tx.amount,
          frais_msats: Number.isSafeInteger(tx.fees_paid) ? tx.fees_paid : 0,
          regle_le: isoDepuisSecondes(tx.settled_at || Math.floor(Date.now() / 1000)),
        };
        if (typeof tx.preimage === 'string' && /^[0-9a-f]{64}$/i.test(tx.preimage)) notif.preimage = tx.preimage;
        ecouteur(notif);
      },
      ['payment_received', 'payment_sent'],
    );
    this.desabonnements.push(desabonner);
    return desabonner;
  }

  fermer(): void {
    for (const d of this.desabonnements) {
      try {
        d();
      } catch {
        /* déjà fermé */
      }
    }
    this.desabonnements = [];
    try {
      this.client.close();
    } catch {
      /* relais déjà fermé */
    }
  }

  private optionsResolution(): OptionsResolution {
    return { reseauxAutorises: RESEAUX_NWC, ...this.options.resolution };
  }
}

// ---------------------------------------------------------------------------

export function factureDepuisTransaction(tx: TransactionNip47, paymentHashAttendu?: string): Facture {
  const hash = (tx.payment_hash || paymentHashAttendu || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw erreur('INTERNE', 'Réponse du portefeuille sans payment_hash');
  if (paymentHashAttendu && hash !== paymentHashAttendu.toLowerCase()) {
    throw erreur('INTERNE', 'Le portefeuille a renvoyé une autre facture que celle demandée');
  }
  const maintenantS = Math.floor(Date.now() / 1000);
  const reglee = (typeof tx.settled_at === 'number' && tx.settled_at > 0) || tx.state === 'settled';
  // Certains portefeuilles (ex. Coinos) renvoient amount = 0 ou omettent expires_at tant que la facture
  // n'est pas réglée : on complète depuis la facture BOLT11 elle-même, qui fait foi.
  let decode: ReturnType<typeof decoderBolt11> | undefined;
  if (typeof tx.invoice === 'string' && tx.invoice.length > 0) {
    try {
      decode = decoderBolt11(tx.invoice);
    } catch {
      decode = undefined;
    }
  }
  let montant = Number.isSafeInteger(tx.amount) && tx.amount > 0 ? tx.amount : 0;
  if (montant === 0 && decode?.montant_msats) montant = decode.montant_msats;
  const expireLeS =
    typeof tx.expires_at === 'number' && tx.expires_at > 0
      ? tx.expires_at
      : (decode?.expire_le_s ?? (typeof tx.created_at === 'number' && tx.created_at > 0 ? tx.created_at : maintenantS) + 3600);
  const facture: Facture = {
    payment_hash: hash,
    statut: reglee ? 'reglee' : expireLeS <= maintenantS ? 'expiree' : 'en_attente',
    montant_msats: montant,
    expire_le: isoDepuisSecondes(expireLeS),
  };
  if (reglee) {
    facture.regle_le = isoDepuisSecondes(tx.settled_at || maintenantS);
    if (typeof tx.preimage === 'string' && /^[0-9a-f]{64}$/i.test(tx.preimage)) facture.preimage = tx.preimage.toLowerCase();
  }
  return facture;
}

export function transactionNormalisee(tx: TransactionNip47): Transaction {
  const reglee = (typeof tx.settled_at === 'number' && tx.settled_at > 0) || tx.state === 'settled';
  const statut: Transaction['statut'] = tx.state === 'failed' ? 'echouee' : reglee ? 'reglee' : 'en_attente';
  return {
    type: tx.type === 'incoming' ? 'entrante' : 'sortante',
    statut,
    montant_msats: Number.isSafeInteger(tx.amount) ? tx.amount : 0,
    frais_msats: Number.isSafeInteger(tx.fees_paid) ? tx.fees_paid : 0,
    description: typeof tx.description === 'string' ? tx.description.slice(0, 640) : '',
    payment_hash: typeof tx.payment_hash === 'string' ? tx.payment_hash.toLowerCase() : '',
    regle_le: reglee ? isoDepuisSecondes(tx.settled_at) : null,
    cree_le: isoDepuisSecondes(tx.created_at || 0),
  };
}

/** Traduit une erreur du SDK Alby / NIP-47 en erreur typée du contrat. */
export function traduireErreurNwc(e: unknown, operation = 'appel au portefeuille'): Error {
  if (estErreurPasserelle(e)) return e;
  if (e instanceof nwc.Nip47TimeoutError) return erreur('DELAI_DEPASSE', `Le portefeuille n’a pas répondu (${operation})`, e);
  if (e instanceof nwc.Nip47NetworkError || e instanceof nwc.Nip47PublishError) {
    return erreur('PORTEFEUILLE_INJOIGNABLE', 'Relais ou portefeuille injoignable', e);
  }
  if (e instanceof nwc.Nip47UnsupportedEncryptionError) {
    return erreur('PORTEFEUILLE_INJOIGNABLE', 'Chiffrement du portefeuille incompatible', e);
  }
  if (e instanceof nwc.Nip47WalletError) {
    const code = String(e.code ?? '').toUpperCase();
    const table: Record<string, CodeErreur> = {
      INSUFFICIENT_BALANCE: 'SOLDE_INSUFFISANT',
      QUOTA_EXCEEDED: 'BUDGET_DEPASSE',
      RESTRICTED: 'PERMISSION_MANQUANTE',
      UNAUTHORIZED: 'PERMISSION_MANQUANTE',
      NOT_IMPLEMENTED: 'PERMISSION_MANQUANTE',
      NOT_FOUND: 'FACTURE_INCONNUE',
      PAYMENT_FAILED: 'PAIEMENT_ECHOUE',
      RATE_LIMITED: 'PORTEFEUILLE_INJOIGNABLE',
    };
    const cible = table[code] ?? 'INTERNE';
    return erreur(cible, cible === 'INTERNE' ? 'Le portefeuille a renvoyé une erreur' : undefined, e);
  }
  if (e instanceof nwc.Nip47Error) return erreur('INTERNE', 'Réponse du portefeuille inattendue', e);
  if (e instanceof Error && /connect|relay|websocket|info event/i.test(e.message)) {
    return erreur('PORTEFEUILLE_INJOIGNABLE', 'Relais ou portefeuille injoignable', e);
  }
  return erreur('INTERNE', undefined, e);
}
