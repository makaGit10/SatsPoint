import { z } from 'zod';
import { signer } from './securite/hmac.js';

/**
 * Client HTTP signé vers l'API Laravel (contrat § 3). Toutes les requêtes portent les en-têtes HMAC.
 * Les URI reçues ne sont jamais journalisées.
 */

const schemaConnexions = z.object({
  connexions: z.array(
    z.object({
      id: z.string().min(1).max(64),
      uri: z.string().min(1).max(4096),
      budget_msats: z.number().int().nonnegative().optional(),
    }),
  ),
});

export type ConnexionAReprendre = z.infer<typeof schemaConnexions>['connexions'][number];

export type EvenementApi = {
  type: 'payment_received' | 'payment_sent';
  id: string;
  payment_hash: string;
  montant_msats: number;
  regle_le: string;
  preimage?: string;
};

export class ErreurApiInterne extends Error {
  constructor(
    message: string,
    readonly statut: number | undefined,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ErreurApiInterne';
  }
}

export class ApiInterne {
  private readonly base: URL;

  constructor(
    baseUrl: string,
    private readonly secret: string,
    private readonly options: { delaiMs?: number; fetchImpl?: typeof fetch } = {},
  ) {
    this.base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  }

  get url(): string {
    return this.base.toString().replace(/\/$/, '');
  }

  async requete(methode: 'GET' | 'POST', chemin: string, corps?: unknown): Promise<Response> {
    const url = new URL(chemin.replace(/^\//, ''), this.base);
    const corpsBrut = corps === undefined ? '' : JSON.stringify(corps);
    const cheminSigne = url.pathname + url.search;
    const enTetes: Record<string, string> = {
      Accept: 'application/json',
      ...signer(this.secret, { methode, chemin: cheminSigne, corps: corpsBrut }),
    };
    if (corps !== undefined) enTetes['Content-Type'] = 'application/json';
    const f = this.options.fetchImpl ?? fetch;
    try {
      return await f(url, {
        method: methode,
        headers: enTetes,
        body: corps === undefined ? undefined : corpsBrut,
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.delaiMs ?? 10_000),
      });
    } catch (e) {
      throw new ErreurApiInterne(`API injoignable (${methode} ${url.pathname})`, undefined, e);
    }
  }

  /** `GET /internal/lightning/connexions` → connexions à réhydrater. */
  async listerConnexions(): Promise<ConnexionAReprendre[]> {
    const reponse = await this.requete('GET', '/internal/lightning/connexions');
    if (!reponse.ok) throw new ErreurApiInterne(`Réponse ${reponse.status} de l’API (connexions)`, reponse.status);
    const brut: unknown = await reponse.json();
    const r = schemaConnexions.safeParse(brut);
    if (!r.success) throw new ErreurApiInterne('Réponse de l’API (connexions) mal formée', reponse.status);
    return r.data.connexions;
  }

  /** `POST /internal/lightning/evenement` → l'API répond 202 puis revérifie elle-même. */
  async envoyerEvenement(ev: EvenementApi): Promise<void> {
    const reponse = await this.requete('POST', '/internal/lightning/evenement', ev);
    if (!reponse.ok) throw new ErreurApiInterne(`Réponse ${reponse.status} de l’API (événement)`, reponse.status);
  }
}
