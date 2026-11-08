/**
 * Formes normalisées exposées par la passerelle (contrat § 2) — indépendantes du type de portefeuille.
 * Montants en millisats (entiers), dates en ISO 8601 UTC.
 */

export type InfoPortefeuille = {
  pubkey: string;
  relais: string[];
  alias: string;
  methods: string[];
  notifications: string[];
  lud16?: string;
  mock: boolean;
};

export type DemandeFacture = {
  montant_msats: number;
  description: string;
  expiration_s: number;
};

export type FactureCreee = {
  bolt11: string;
  payment_hash: string;
  montant_msats: number;
  cree_le: string;
  expire_le: string;
};

export type StatutFacture = 'en_attente' | 'reglee' | 'expiree';

export type Facture = {
  payment_hash: string;
  statut: StatutFacture;
  montant_msats: number;
  regle_le?: string;
  preimage?: string;
  expire_le: string;
};

export type TypeTransaction = 'entrante' | 'sortante';
export type StatutTransaction = 'reglee' | 'en_attente' | 'echouee';

export type Transaction = {
  type: TypeTransaction;
  statut: StatutTransaction;
  montant_msats: number;
  frais_msats: number;
  description: string;
  payment_hash: string;
  regle_le: string | null;
  cree_le: string;
};

export type FiltreTransactions = {
  limite: number;
  decalage: number;
  type?: TypeTransaction;
};

export type DemandePaiement = {
  bolt11: string;
  /** Obligatoire si la facture ne porte pas de montant. */
  montant_msats?: number;
};

export type ResultatPaiement = {
  payment_hash: string;
  preimage: string;
  frais_msats: number;
  montant_msats: number;
};

export type ApercuPaiement = {
  type: 'bolt11' | 'adresse' | 'lnurl';
  bolt11?: string;
  montant_msats: number;
  description?: string;
  destinataire?: string;
  min_msats?: number;
  max_msats?: number;
  payment_hash?: string;
  expire_le?: string;
};

export type NotificationPortefeuille = {
  type: 'payment_received' | 'payment_sent';
  payment_hash: string;
  montant_msats: number;
  frais_msats: number;
  regle_le: string;
  preimage?: string;
};

export type EcouteurNotification = (n: NotificationPortefeuille) => void;

export interface Portefeuille {
  readonly mock: boolean;
  getInfo(): Promise<InfoPortefeuille>;
  makeInvoice(demande: DemandeFacture): Promise<FactureCreee>;
  lookupInvoice(paymentHash: string): Promise<Facture>;
  getBalance(): Promise<{ msats: number }>;
  listTransactions(filtre: FiltreTransactions): Promise<Transaction[]>;
  payInvoice(demande: DemandePaiement): Promise<ResultatPaiement>;
  apercuPaiement(demande: { destination: string; montant_msats?: number }): Promise<ApercuPaiement>;
  /** S'abonne aux notifications `payment_received` / `payment_sent` ; renvoie la fonction de désabonnement. */
  onNotification(ecouteur: EcouteurNotification): Promise<() => void>;
  /** Libère les ressources (connexion au relais, abonnements). */
  fermer(): void;
}

export function isoDepuisSecondes(secondes: number): string {
  return new Date(secondes * 1000).toISOString();
}
