import { createECDH, createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { erreur } from '../erreurs.js';
import { abregerHash, type Journal } from '../journal.js';
import {
  apercuDepuisResolution,
  obtenirFactureLnurl,
  resoudreDestination,
  type OptionsResolution,
} from '../paiements/destination.js';
import { decoderBolt11, factureExpiree, type ReseauBolt11 } from './bolt11.js';
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

// `bolt11` (bitcoinjs) est publié en CommonJS : chargement via require.
const require = createRequire(import.meta.url);
type Bolt11Lib = typeof import('bolt11');
const bolt11Lib = require('bolt11') as Bolt11Lib;

const RESEAU_REGTEST = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, validWitnessVersions: [0, 1] };
const RESEAUX_MOCK: readonly ReseauBolt11[] = ['bcrt', 'bc'];
export const SOLDE_INITIAL_MSATS = 100_000 * 1_000; // 100 000 sats
const METHODES_MOCK = ['get_info', 'get_balance', 'make_invoice', 'lookup_invoice', 'list_transactions', 'pay_invoice'];
const NOTIFICATIONS_MOCK = ['payment_received', 'payment_sent'];
const MAX_FACTURES_MEMOIRE = 5_000;

type FactureMock = {
  payment_hash: string;
  preimage: string;
  bolt11: string;
  montant_msats: number;
  description: string;
  cree_le_s: number;
  expire_le_s: number;
  regle_le_s: number | null;
};

type TransactionMock = Transaction & { ordre: number };

export type OptionsMock = {
  journal: Journal;
  resolution?: Partial<OptionsResolution>;
  /** Horloge injectable (tests). */
  maintenantS?: () => number;
};

/**
 * Portefeuille simulé en mémoire (contrat § 4) : factures BOLT11 valides sur le réseau regtest
 * (`lnbcrt`), signées par une clé de test générée au démarrage ; solde de départ 100 000 sats ;
 * `payer(hash)` règle une facture et émet `payment_received` comme un vrai portefeuille.
 */
export class PortefeuilleMock implements Portefeuille {
  readonly mock = true;
  private readonly clePrivee: Buffer;
  private readonly clePublique: string;
  private readonly factures = new Map<string, FactureMock>();
  private readonly transactions: TransactionMock[] = [];
  private readonly ecouteurs = new Set<EcouteurNotification>();
  private soldeMsats = SOLDE_INITIAL_MSATS;
  private compteur = 0;
  private readonly maintenantS: () => number;

  constructor(private readonly options: OptionsMock) {
    const ecdh = createECDH('secp256k1');
    ecdh.generateKeys();
    this.clePrivee = ecdh.getPrivateKey();
    this.clePublique = ecdh.getPublicKey('hex', 'compressed');
    this.maintenantS = options.maintenantS ?? (() => Math.floor(Date.now() / 1000));
  }

  async getInfo(): Promise<InfoPortefeuille> {
    return {
      pubkey: this.clePublique,
      relais: [],
      alias: 'Portefeuille simulé SatsPoint',
      methods: [...METHODES_MOCK],
      notifications: [...NOTIFICATIONS_MOCK],
      mock: true,
    };
  }

  async makeInvoice(d: DemandeFacture): Promise<FactureCreee> {
    this.purger();
    const preimage = randomBytes(32);
    const paymentHash = createHash('sha256').update(preimage).digest('hex');
    const creeLeS = this.maintenantS();
    const expireLeS = creeLeS + d.expiration_s;
    const encodee = bolt11Lib.encode(
      {
        network: RESEAU_REGTEST,
        millisatoshis: String(d.montant_msats),
        timestamp: creeLeS,
        tags: [
          { tagName: 'payment_hash', data: paymentHash },
          { tagName: 'payment_secret', data: randomBytes(32).toString('hex') },
          { tagName: 'description', data: d.description },
          { tagName: 'expire_time', data: d.expiration_s },
          { tagName: 'min_final_cltv_expiry', data: 40 },
          {
            tagName: 'feature_bits',
            data: {
              word_length: 4,
              var_onion_optin: { required: true, supported: true },
              payment_secret: { required: true, supported: true },
            },
          },
        ],
      },
      false,
    );
    const signee = bolt11Lib.sign(encodee, this.clePrivee);
    const facture: FactureMock = {
      payment_hash: paymentHash,
      preimage: preimage.toString('hex'),
      bolt11: signee.paymentRequest ?? '',
      montant_msats: d.montant_msats,
      description: d.description,
      cree_le_s: creeLeS,
      expire_le_s: expireLeS,
      regle_le_s: null,
    };
    if (!facture.bolt11) throw erreur('INTERNE', 'Échec de la signature de la facture simulée');
    this.factures.set(paymentHash, facture);
    this.options.journal.info({ hash: abregerHash(paymentHash), montant_msats: d.montant_msats }, 'facture créée (mock)');
    return {
      bolt11: facture.bolt11,
      payment_hash: paymentHash,
      montant_msats: d.montant_msats,
      cree_le: isoDepuisSecondes(creeLeS),
      expire_le: isoDepuisSecondes(expireLeS),
    };
  }

  async lookupInvoice(paymentHash: string): Promise<Facture> {
    const f = this.factures.get(paymentHash.toLowerCase());
    if (!f) throw erreur('FACTURE_INCONNUE');
    return this.versFacture(f);
  }

  async getBalance(): Promise<{ msats: number }> {
    return { msats: this.soldeMsats };
  }

  async listTransactions(filtre: FiltreTransactions): Promise<Transaction[]> {
    const liste = this.transactions
      .filter((t) => !filtre.type || t.type === filtre.type)
      .sort((a, b) => b.ordre - a.ordre)
      .slice(filtre.decalage, filtre.decalage + filtre.limite);
    return liste.map(({ ordre: _ordre, ...t }) => t);
  }

  async payInvoice(d: DemandePaiement): Promise<ResultatPaiement> {
    const decode = decoderBolt11(d.bolt11);
    if (!RESEAUX_MOCK.includes(decode.reseau)) throw erreur('FACTURE_INVALIDE', 'Réseau de la facture non pris en charge');
    if (factureExpiree(decode, this.maintenantS())) throw erreur('FACTURE_INVALIDE', 'Facture expirée');
    const montant = decode.montant_msats ?? d.montant_msats;
    if (montant === undefined) throw erreur('FACTURE_INVALIDE', 'Facture sans montant : montant_msats est requis');
    if (decode.montant_msats !== null && d.montant_msats !== undefined && d.montant_msats !== decode.montant_msats) {
      throw erreur('FACTURE_INVALIDE', 'Le montant demandé diffère du montant de la facture');
    }
    const frais = Math.max(1_000, Math.ceil(montant / 1_000)); // ≥ 1 sat, ~0,1 %
    if (montant + frais > this.soldeMsats) {
      throw erreur('SOLDE_INSUFFISANT', `Solde insuffisant : ${this.soldeMsats} msats disponibles, ${montant + frais} requis (frais inclus)`);
    }
    const interne = this.factures.get(decode.payment_hash);
    if (interne && interne.regle_le_s !== null) throw erreur('FACTURE_INVALIDE', 'Facture déjà réglée');

    const maintenant = this.maintenantS();
    this.soldeMsats -= montant + frais;
    const preimage = interne ? interne.preimage : randomBytes(32).toString('hex');
    this.ajouterTransaction({
      type: 'sortante',
      statut: 'reglee',
      montant_msats: montant,
      frais_msats: frais,
      description: decode.description ?? '',
      payment_hash: decode.payment_hash,
      regle_le: isoDepuisSecondes(maintenant),
      cree_le: isoDepuisSecondes(maintenant),
    });
    this.options.journal.info({ hash: abregerHash(decode.payment_hash), montant_msats: montant, frais_msats: frais }, 'paiement sortant (mock)');
    this.notifier({ type: 'payment_sent', payment_hash: decode.payment_hash, montant_msats: montant, frais_msats: frais, regle_le: isoDepuisSecondes(maintenant), preimage });
    if (interne) this.regler(interne, maintenant); // auto-paiement : la facture interne est réglée aussi
    return { payment_hash: decode.payment_hash, preimage, frais_msats: frais, montant_msats: montant };
  }

  async apercuPaiement(d: { destination: string; montant_msats?: number }): Promise<ApercuPaiement> {
    const res = await resoudreDestination(d.destination, this.optionsResolution());
    return apercuDepuisResolution(res, d.montant_msats);
  }

  async resoudreEnBolt11(destination: string, montantMsats: number): Promise<{ bolt11: string; montant_msats: number }> {
    const res = await resoudreDestination(destination, this.optionsResolution());
    if (res.type === 'bolt11') return { bolt11: res.decode.bolt11, montant_msats: res.decode.montant_msats ?? montantMsats };
    const facture = await obtenirFactureLnurl(res, montantMsats, this.optionsResolution());
    return { bolt11: facture.bolt11, montant_msats: montantMsats };
  }

  async onNotification(ecouteur: EcouteurNotification): Promise<() => void> {
    this.ecouteurs.add(ecouteur);
    return () => this.ecouteurs.delete(ecouteur);
  }

  fermer(): void {
    this.ecouteurs.clear();
  }

  /** Simule le règlement d'une facture par un client (route `POST /mock/{id}/payer/{hash}`). */
  payer(paymentHash: string): { deja_reglee: boolean } {
    const f = this.factures.get(paymentHash.toLowerCase());
    if (!f) throw erreur('FACTURE_INCONNUE');
    if (f.regle_le_s !== null) return { deja_reglee: true };
    const maintenant = this.maintenantS();
    if (f.expire_le_s <= maintenant) throw erreur('FACTURE_INVALIDE', 'Facture expirée');
    this.regler(f, maintenant);
    return { deja_reglee: false };
  }

  // ---------------------------------------------------------------------------

  private regler(f: FactureMock, maintenantS: number): void {
    f.regle_le_s = maintenantS;
    this.soldeMsats += f.montant_msats;
    this.ajouterTransaction({
      type: 'entrante',
      statut: 'reglee',
      montant_msats: f.montant_msats,
      frais_msats: 0,
      description: f.description,
      payment_hash: f.payment_hash,
      regle_le: isoDepuisSecondes(maintenantS),
      cree_le: isoDepuisSecondes(f.cree_le_s),
    });
    this.options.journal.info({ hash: abregerHash(f.payment_hash), montant_msats: f.montant_msats }, 'facture réglée (mock)');
    this.notifier({
      type: 'payment_received',
      payment_hash: f.payment_hash,
      montant_msats: f.montant_msats,
      frais_msats: 0,
      regle_le: isoDepuisSecondes(maintenantS),
      preimage: f.preimage,
    });
  }

  private notifier(n: Parameters<EcouteurNotification>[0]): void {
    for (const e of this.ecouteurs) {
      setImmediate(() => {
        try {
          e(n);
        } catch (err) {
          this.options.journal.error({ erreur: err instanceof Error ? err.message : String(err) }, 'écouteur de notification en erreur');
        }
      });
    }
  }

  private ajouterTransaction(t: Transaction): void {
    this.transactions.push({ ...t, ordre: ++this.compteur });
    if (this.transactions.length > MAX_FACTURES_MEMOIRE) this.transactions.splice(0, this.transactions.length - MAX_FACTURES_MEMOIRE);
  }

  private versFacture(f: FactureMock): Facture {
    const maintenant = this.maintenantS();
    const facture: Facture = {
      payment_hash: f.payment_hash,
      statut: f.regle_le_s !== null ? 'reglee' : f.expire_le_s <= maintenant ? 'expiree' : 'en_attente',
      montant_msats: f.montant_msats,
      expire_le: isoDepuisSecondes(f.expire_le_s),
    };
    if (f.regle_le_s !== null) {
      facture.regle_le = isoDepuisSecondes(f.regle_le_s);
      facture.preimage = f.preimage;
    }
    return facture;
  }

  /** Borne la mémoire : on oublie les factures expirées ou réglées les plus anciennes. */
  private purger(): void {
    if (this.factures.size < MAX_FACTURES_MEMOIRE) return;
    const maintenant = this.maintenantS();
    for (const [hash, f] of this.factures) {
      if (f.regle_le_s !== null || f.expire_le_s + 86_400 < maintenant) this.factures.delete(hash);
      if (this.factures.size < MAX_FACTURES_MEMOIRE / 2) break;
    }
  }

  private optionsResolution(): OptionsResolution {
    return { reseauxAutorises: RESEAUX_MOCK, ...this.options.resolution };
  }
}
