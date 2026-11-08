import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Passerelle } from '../src/app.js';
import type { Portefeuille } from '../src/portefeuilles/types.js';
import { genererNonce } from '../src/securite/hmac.js';
import { appTest, configTest, injecterSigne, journalSilencieux } from './aide.js';

/** Portefeuille factice non simulé (pour vérifier que /mock est refusé sur une connexion réelle). */
function portefeuilleFactice(): Portefeuille {
  return {
    mock: false,
    async getInfo() {
      return { pubkey: 'a'.repeat(64), relais: ['wss://relais.test/'], alias: 'Factice', methods: ['get_info'], notifications: [], mock: false };
    },
    async makeInvoice() {
      throw new Error('non utilisé');
    },
    async lookupInvoice() {
      throw new Error('non utilisé');
    },
    async getBalance() {
      return { msats: 1 };
    },
    async listTransactions() {
      return [];
    },
    async payInvoice() {
      throw new Error('non utilisé');
    },
    async apercuPaiement() {
      throw new Error('non utilisé');
    },
    async onNotification() {
      return () => undefined;
    },
    fermer() {},
  };
}

describe('Sécurité — authentification HMAC des routes', () => {
  let app: Passerelle;

  beforeAll(async () => {
    app = await appTest();
    await app.ready();
  });
  afterAll(() => app.close());

  it('refuse une requête sans en-têtes (401 NON_AUTORISE)', async () => {
    const r = await app.inject({ method: 'GET', url: '/connexions/demo' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ erreur: { code: 'NON_AUTORISE', message: expect.any(String) } });
  });

  it('refuse une signature avec un autre secret', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: '/connexions/demo', secret: 'mauvais-secret-0123456789abcdef' });
    expect(r.statusCode).toBe(401);
  });

  it('refuse un horodatage périmé', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: '/connexions/demo', timestamp: Math.floor(Date.now() / 1000) - 120 });
    expect(r.statusCode).toBe(401);
  });

  it('refuse un nonce rejoué', async () => {
    const nonce = genererNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const r1 = await injecterSigne(app, { method: 'GET', url: '/connexions/demo', nonce, timestamp });
    expect(r1.statusCode).toBe(404); // signature acceptée, connexion inconnue
    const r2 = await injecterSigne(app, { method: 'GET', url: '/connexions/demo', nonce, timestamp });
    expect(r2.statusCode).toBe(401);
  });

  it('refuse un corps modifié après signature', async () => {
    const r = await injecterSigne(app, {
      method: 'PUT',
      url: '/connexions/demo',
      payload: { uri: 'mock://demo' },
      headers: { 'x-sp-signature': 'f'.repeat(64) },
    });
    expect(r.statusCode).toBe(401);
  });

  it('la signature couvre la query string', async () => {
    // Signée pour ?limite=5, envoyée avec ?limite=50 → refus.
    const { signer } = await import('../src/securite/hmac.js');
    const enTetes = signer(configTest().secretHmac, { methode: 'GET', chemin: '/connexions/demo/transactions?limite=5', corps: '' });
    const r = await app.inject({ method: 'GET', url: '/connexions/demo/transactions?limite=50', headers: enTetes });
    expect(r.statusCode).toBe(401);
  });

  it('un corps JSON illisible non signé reçoit 401, pas 400 (rien n’est révélé avant authentification)', async () => {
    const r = await app.inject({ method: 'PUT', url: '/connexions/demo', payload: '{"uri": ', headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(401);
    expect(r.json().erreur.code).toBe('NON_AUTORISE');
  });

  it('route inconnue → 404 ROUTE_INCONNUE (forme d’erreur du contrat)', async () => {
    const r = await app.inject({ method: 'GET', url: '/nimporte' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erreur: { code: 'ROUTE_INCONNUE', message: expect.any(String) } });
  });

  it('/mock/{id}/payer sur une connexion non simulée → 404', async () => {
    const appFactice = await appTest({ fabrique: () => portefeuilleFactice() });
    await appFactice.ready();
    const put = await injecterSigne(appFactice, { method: 'PUT', url: '/connexions/reelle', payload: { uri: 'nostr+walletconnect://x' } });
    expect(put.statusCode).toBe(200);
    expect(put.json().mock).toBe(false);
    const r = await injecterSigne(appFactice, { method: 'POST', url: `/mock/reelle/payer/${'a'.repeat(64)}` });
    expect(r.statusCode).toBe(404);
    expect(r.json().erreur.code).toBe('CONNEXION_INCONNUE');
    await appFactice.close();
  });
});

describe('Sécurité — mode simulé interdit en production', () => {
  it('refuse mock:// si NODE_ENV=production sans ALLOW_MOCK_WALLET', async () => {
    const app = await appTest({ config: configTest({ nodeEnv: 'production', mockAutorise: false }) });
    await app.ready();
    const r = await injecterSigne(app, { method: 'PUT', url: '/connexions/demo', payload: { uri: 'mock://demo' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('URI_INVALIDE');
    expect(r.json().erreur.message).toMatch(/production/i);
    const sante = await app.inject({ method: 'GET', url: '/sante' });
    expect(sante.json().connexions).toBe(0);
    await app.close();
  });

  it('accepte mock:// en production si ALLOW_MOCK_WALLET=true', async () => {
    const app = await appTest({ config: configTest({ nodeEnv: 'production', mockAutorise: true }) });
    await app.ready();
    const r = await injecterSigne(app, { method: 'PUT', url: '/connexions/demo', payload: { uri: 'mock://demo' } });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it('chargerConfig applique la règle NODE_ENV/ALLOW_MOCK_WALLET et exige le secret', async () => {
    const { chargerConfig } = await import('../src/config.js');
    const base = { GATEWAY_HMAC_SECRET: 'un-secret-suffisamment-long' };
    expect(chargerConfig({ ...base, NODE_ENV: 'production' }).mockAutorise).toBe(false);
    expect(chargerConfig({ ...base, NODE_ENV: 'production', ALLOW_MOCK_WALLET: 'true' }).mockAutorise).toBe(true);
    expect(chargerConfig({ ...base, NODE_ENV: 'development' }).mockAutorise).toBe(true);
    expect(chargerConfig({ ...base }).port).toBe(3011);
    expect(chargerConfig({ ...base, API_INTERNAL_URL: 'http://api:8000/' }).apiInternalUrl).toBe('http://api:8000');
    expect(() => chargerConfig({})).toThrow(/GATEWAY_HMAC_SECRET/);
    expect(() => chargerConfig({ GATEWAY_HMAC_SECRET: 'court' })).toThrow();
    expect(() => chargerConfig({ ...base, API_INTERNAL_URL: 'ftp://x' })).toThrow();
  });
});

describe('Sécurité — journal', () => {
  it('masque les champs sensibles (uri, secret, preimage, bolt11, signature)', async () => {
    const { Writable } = await import('node:stream');
    const lignes: string[] = [];
    const flux = new Writable({
      write(chunk, _enc, cb) {
        lignes.push(String(chunk));
        cb();
      },
    });
    const { creerJournal, abregerHash } = await import('../src/journal.js');
    const journal = creerJournal('info', flux);
    journal.info(
      {
        uri: 'nostr+walletconnect://secret-uri',
        connexion: { uri: 'uri-imbriquee', preimage: 'preimage-imbriquee', secret: 'secret-imbrique' },
        preimage: 'preimage-racine',
        bolt11: 'lnbc1facture',
        req: { headers: { 'x-sp-signature': 'signature-hmac', authorization: 'Bearer x' } },
        hash: abregerHash('0123456789abcdef0123456789abcdef'),
      },
      'test',
    );
    journal.flush?.();
    await new Promise((r) => setTimeout(r, 50));
    const sortie = lignes.join('');
    expect(sortie).toContain('"msg":"test"');
    for (const interdit of ['secret-uri', 'uri-imbriquee', 'preimage-imbriquee', 'secret-imbrique', 'preimage-racine', 'lnbc1facture', 'signature-hmac', 'Bearer x']) {
      expect(sortie).not.toContain(interdit);
    }
    expect(sortie).toContain('[masqué]');
    expect(sortie).toContain('"hash":"01234567"');
    expect(abregerHash(undefined)).toBe('-');
    void journalSilencieux;
  });
});
