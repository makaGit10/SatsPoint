import Fastify, { type FastifyInstance } from 'fastify';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { construireApp, type OptionsApp, type Passerelle } from '../src/app.js';
import { ApiInterne } from '../src/api-interne.js';
import { DELAI_PORTEFEUILLE_MS, type Config } from '../src/config.js';
import { Evenements } from '../src/evenements.js';
import { creerJournal } from '../src/journal.js';
import type { PortefeuilleMock } from '../src/portefeuilles/mock.js';
import { signer, VerificateurHmac } from '../src/securite/hmac.js';

export const SECRET_TEST = 'secret-de-test-0123456789abcdef';

export const journalSilencieux = creerJournal('silent');

export function configTest(surcharge: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    port: 0,
    host: '127.0.0.1',
    secretHmac: SECRET_TEST,
    apiInternalUrl: undefined,
    logLevel: 'silent',
    mockAutorise: true,
    delaiPortefeuilleMs: DELAI_PORTEFEUILLE_MS,
    ...surcharge,
  };
}

export async function appTest(options: Partial<OptionsApp> = {}): Promise<Passerelle> {
  return construireApp({
    config: configTest(),
    journal: journalSilencieux,
    resolution: { autoriserHttpLocal: true },
    ...options,
  });
}

export type RequeteSignee = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload?: unknown;
  secret?: string;
  timestamp?: number;
  nonce?: string;
  headers?: Record<string, string>;
};

/** Injecte une requête signée HMAC dans l'application (sans réseau). */
export async function injecterSigne(app: FastifyInstance, r: RequeteSignee): Promise<LightMyRequestResponse> {
  const corps = r.payload === undefined ? '' : JSON.stringify(r.payload);
  const enTetes = signer(r.secret ?? SECRET_TEST, {
    methode: r.method,
    chemin: r.url,
    corps,
    ...(r.timestamp !== undefined ? { timestamp: r.timestamp } : {}),
    ...(r.nonce !== undefined ? { nonce: r.nonce } : {}),
  });
  const options: InjectOptions = {
    method: r.method,
    url: r.url,
    headers: { ...enTetes, ...(r.payload !== undefined ? { 'content-type': 'application/json' } : {}), ...r.headers },
  };
  if (r.payload !== undefined) options.payload = corps;
  return app.inject(options);
}

export type EvenementRecu = {
  type: string;
  id: string;
  payment_hash: string;
  montant_msats: number;
  regle_le: string;
  preimage?: string;
};

export type FauxApi = {
  url: string;
  evenements: EvenementRecu[];
  refusSignature: number;
  /** Nombre de réponses en échec à produire avant d'accepter (pour tester les reprises). */
  echecsRestants: number;
  connexions: Array<{ id: string; uri: string; budget_msats?: number }>;
  appelsConnexions: number;
  attendreEvenements(n: number, delaiMs?: number): Promise<EvenementRecu[]>;
  fermer(): Promise<void>;
};

/** Faux serveur API Laravel : vérifie la signature HMAC et mémorise les événements reçus. */
export async function demarrerFauxApi(secret: string = SECRET_TEST): Promise<FauxApi> {
  const serveur = Fastify({ logger: false });
  const verificateur = new VerificateurHmac(secret);
  const etat: FauxApi = {
    url: '',
    evenements: [],
    refusSignature: 0,
    echecsRestants: 0,
    connexions: [],
    appelsConnexions: 0,
    async attendreEvenements(n, delaiMs = 5_000) {
      const debut = Date.now();
      while (etat.evenements.length < n) {
        if (Date.now() - debut > delaiMs) throw new Error(`seulement ${etat.evenements.length}/${n} événements reçus`);
        await new Promise((r) => setTimeout(r, 20));
      }
      return etat.evenements;
    },
    async fermer() {
      await serveur.close();
    },
  };

  serveur.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, corps, fin) => {
    try {
      fin(null, { brut: corps, json: corps === '' ? undefined : JSON.parse(corps as string) });
    } catch (e) {
      fin(e as Error, undefined);
    }
  });

  serveur.addHook('preHandler', async (req, reply) => {
    const corps = (req.body as { brut?: string } | undefined)?.brut ?? '';
    const r = verificateur.verifier({
      methode: req.method,
      chemin: req.raw.url ?? req.url,
      corps,
      enTetes: {
        timestamp: req.headers['x-sp-timestamp'] as string | undefined,
        nonce: req.headers['x-sp-nonce'] as string | undefined,
        signature: req.headers['x-sp-signature'] as string | undefined,
      },
    });
    if (!r.ok) {
      etat.refusSignature++;
      return reply.status(401).send({ erreur: r.raison });
    }
  });

  serveur.get('/internal/lightning/connexions', async () => {
    etat.appelsConnexions++;
    if (etat.echecsRestants > 0) {
      etat.echecsRestants--;
      throw new Error('API pas prête');
    }
    return { connexions: etat.connexions };
  });

  serveur.post('/internal/lightning/evenement', async (req, reply) => {
    if (etat.echecsRestants > 0) {
      etat.echecsRestants--;
      return reply.status(503).send({ erreur: 'indisponible' });
    }
    etat.evenements.push((req.body as { json: EvenementRecu }).json);
    return reply.status(202).send({ ok: true });
  });

  const adresse = await serveur.listen({ port: 0, host: '127.0.0.1' });
  etat.url = adresse;
  return etat;
}

export function apiVers(faux: FauxApi, secret: string = SECRET_TEST): ApiInterne {
  return new ApiInterne(faux.url, secret, { delaiMs: 2_000 });
}

export function evenementsRapides(api: ApiInterne | undefined): Evenements {
  return new Evenements(api, journalSilencieux, { delaisMs: [20, 40, 60, 80], tentativesMax: 5 });
}

/** Faux service LNURL-pay (LUD-06/16) adossé à un portefeuille simulé qui produit les factures. */
export async function demarrerFauxLnurl(mock: PortefeuilleMock, options: { min?: number; max?: number } = {}) {
  const serveur = Fastify({ logger: false });
  const metadata = JSON.stringify([
    ['text/plain', 'Dons à Awa'],
    ['text/identifier', 'awa@exemple.test'],
  ]);
  let base = '';
  const etat = { appelsCallback: 0, dernierMontant: 0, factures: [] as string[] };
  serveur.get('/.well-known/lnurlp/:nom', async () => ({
    tag: 'payRequest',
    callback: `${base}/lnurl/callback`,
    minSendable: options.min ?? 1_000,
    maxSendable: options.max ?? 1_000_000_000,
    metadata,
    commentAllowed: 0,
  }));
  serveur.get('/lnurlp', async () => ({
    tag: 'payRequest',
    callback: `${base}/lnurl/callback`,
    minSendable: options.min ?? 1_000,
    maxSendable: options.max ?? 1_000_000_000,
    metadata,
  }));
  serveur.get('/lnurl/callback', async (req, reply) => {
    const montant = Number((req.query as { amount?: string }).amount);
    etat.appelsCallback++;
    etat.dernierMontant = montant;
    if (!Number.isSafeInteger(montant) || montant <= 0) return reply.status(400).send({ status: 'ERROR', reason: 'montant' });
    const f = await mock.makeInvoice({ montant_msats: montant, description: 'Dons à Awa', expiration_s: 600 });
    etat.factures.push(f.payment_hash);
    return { pr: f.bolt11, routes: [] };
  });
  base = await serveur.listen({ port: 0, host: '127.0.0.1' });
  return {
    url: base,
    hote: new URL(base).host,
    etat,
    fermer: () => serveur.close(),
  };
}
