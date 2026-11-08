/**
 * Erreurs typées de la passerelle. Les codes sont ceux du contrat
 * (docs/CONTRAT_PASSERELLE.md § 2) plus quatre codes transversaux documentés :
 * ENTREE_INVALIDE (validation), NON_AUTORISE (HMAC), ROUTE_INCONNUE (404), PAIEMENT_ECHOUE.
 */
export const CODES_ERREUR = {
  CONNEXION_INCONNUE: 404,
  URI_INVALIDE: 400,
  PORTEFEUILLE_INJOIGNABLE: 502,
  PERMISSION_MANQUANTE: 403,
  BUDGET_DEPASSE: 403,
  SOLDE_INSUFFISANT: 402,
  FACTURE_INVALIDE: 400,
  FACTURE_INCONNUE: 404,
  DESTINATION_INVALIDE: 400,
  DELAI_DEPASSE: 504,
  INTERNE: 500,
  ENTREE_INVALIDE: 400,
  NON_AUTORISE: 401,
  ROUTE_INCONNUE: 404,
  PAIEMENT_ECHOUE: 422,
} as const;

export type CodeErreur = keyof typeof CODES_ERREUR;

const MESSAGES_PAR_DEFAUT: Record<CodeErreur, string> = {
  CONNEXION_INCONNUE: 'Connexion inconnue',
  URI_INVALIDE: 'URI de portefeuille invalide',
  PORTEFEUILLE_INJOIGNABLE: 'Portefeuille injoignable',
  PERMISSION_MANQUANTE: 'Permission manquante sur le portefeuille',
  BUDGET_DEPASSE: 'Budget de dépense dépassé',
  SOLDE_INSUFFISANT: 'Solde insuffisant',
  FACTURE_INVALIDE: 'Facture invalide',
  FACTURE_INCONNUE: 'Facture inconnue',
  DESTINATION_INVALIDE: 'Destination invalide',
  DELAI_DEPASSE: 'Le portefeuille n’a pas répondu dans le délai imparti',
  INTERNE: 'Erreur interne de la passerelle',
  ENTREE_INVALIDE: 'Entrée invalide',
  NON_AUTORISE: 'Requête non autorisée',
  ROUTE_INCONNUE: 'Route inconnue',
  PAIEMENT_ECHOUE: 'Le paiement a échoué',
};

export class ErreurPasserelle extends Error {
  readonly code: CodeErreur;
  readonly statut: number;
  override readonly cause: unknown;

  constructor(code: CodeErreur, message?: string, cause?: unknown) {
    super(message ?? MESSAGES_PAR_DEFAUT[code]);
    this.name = 'ErreurPasserelle';
    this.code = code;
    this.statut = CODES_ERREUR[code];
    this.cause = cause;
  }

  /** Forme JSON du contrat : `{ erreur: { code, message } }` — jamais de détail technique. */
  versJson(): { erreur: { code: CodeErreur; message: string } } {
    return { erreur: { code: this.code, message: this.message } };
  }
}

export function erreur(code: CodeErreur, message?: string, cause?: unknown): ErreurPasserelle {
  return new ErreurPasserelle(code, message, cause);
}

export function estErreurPasserelle(e: unknown): e is ErreurPasserelle {
  return e instanceof ErreurPasserelle;
}
