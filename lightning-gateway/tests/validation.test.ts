import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Passerelle } from '../src/app.js';
import { LIMITE_CORPS_OCTETS } from '../src/app.js';
import { appTest, injecterSigne } from './aide.js';

describe('Validation des entrées (zod, rejet par défaut)', () => {
  let app: Passerelle;
  const id = 'demo';

  beforeAll(async () => {
    app = await appTest();
    await app.ready();
    const r = await injecterSigne(app, { method: 'PUT', url: `/connexions/${id}`, payload: { uri: 'mock://demo' } });
    expect(r.statusCode).toBe(200);
  });
  afterAll(() => app.close());

  function attendreEntreeInvalide(statut: number, corps: { erreur: { code: string; message: string } }) {
    expect(statut).toBe(400);
    expect(corps.erreur.code).toBe('ENTREE_INVALIDE');
    expect(corps.erreur.message).not.toMatch(/at |node_modules|\\/); // aucune trace technique
  }

  it('identifiant de connexion mal formé', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${encodeURIComponent('a b/../x')}/solde` });
    expect([400, 404]).toContain(r.statusCode);
    const r2 = await injecterSigne(app, { method: 'GET', url: `/connexions/${'x'.repeat(65)}/solde` });
    attendreEntreeInvalide(r2.statusCode, r2.json());
  });

  it('PUT /connexions : uri manquante, champ inconnu, budget négatif', async () => {
    for (const payload of [{}, { uri: '' }, { uri: 'mock://demo', inconnu: 1 }, { uri: 'mock://demo', budget_msats: -1 }, { uri: 'mock://demo', budget_msats: 1.5 }, { uri: 42 }]) {
      const r = await injecterSigne(app, { method: 'PUT', url: `/connexions/${id}`, payload });
      attendreEntreeInvalide(r.statusCode, r.json());
    }
  });

  it('PUT /connexions : schéma d’URI inconnu → URI_INVALIDE', async () => {
    for (const uri of ['https://exemple.test', 'mock://', 'mock://Démo!', 'nostr+walletconnect://pasunepubkey?relay=wss://r&secret=x', 'nostr+walletconnect://' + 'a'.repeat(64)]) {
      const r = await injecterSigne(app, { method: 'PUT', url: `/connexions/autre`, payload: { uri } });
      expect(r.statusCode).toBe(400);
      expect(r.json().erreur.code).toBe('URI_INVALIDE');
    }
  });

  it('POST /factures : montant non entier, négatif, trop grand, description trop longue, expiration hors bornes', async () => {
    const cas = [
      { montant_msats: 0 },
      { montant_msats: -5 },
      { montant_msats: 1.5 },
      { montant_msats: '1000' },
      { montant_msats: 1e20 },
      { montant_msats: 1000, description: 'x'.repeat(640) },
      { montant_msats: 1000, description: 'é'.repeat(400) }, // 800 octets
      { montant_msats: 1000, expiration_s: 5 },
      { montant_msats: 1000, expiration_s: 999_999_999 },
      { montant_msats: 1000, autre: true },
      {},
    ];
    for (const payload of cas) {
      const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/factures`, payload });
      attendreEntreeInvalide(r.statusCode, r.json());
    }
  });

  it('POST /factures : valeurs par défaut (description vide, expiration 900 s)', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/factures`, payload: { montant_msats: 1000 } });
    expect(r.statusCode).toBe(201);
    const f = r.json();
    expect(new Date(f.expire_le).getTime() - new Date(f.cree_le).getTime()).toBe(900_000);
  });

  it('GET /factures/{hash} : hash mal formé', async () => {
    for (const hash of ['abc', 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
      const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/factures/${hash}` });
      attendreEntreeInvalide(r.statusCode, r.json());
    }
  });

  it('GET /transactions : limite et décalage bornés, type contrôlé', async () => {
    for (const q of ['limite=0', 'limite=101', 'limite=abc', 'decalage=-1', 'type=autre', 'inconnu=1']) {
      const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/transactions?${q}` });
      attendreEntreeInvalide(r.statusCode, r.json());
    }
    const ok = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/transactions?limite=100&decalage=0&type=sortante` });
    expect(ok.statusCode).toBe(200);
  });

  it('POST /paiements : ni bolt11 ni destination, ou destination sans montant', async () => {
    for (const payload of [{}, { destination: 'awa@exemple.test' }, { bolt11: '' }, { bolt11: 'lnbc1', destination: 'x', montant_msats: 1 }]) {
      const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload });
      attendreEntreeInvalide(r.statusCode, r.json());
    }
  });

  it('POST /paiements : BOLT11 mal formé → FACTURE_INVALIDE ; destination inconnue → DESTINATION_INVALIDE', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { bolt11: 'lnbc1garbage' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('FACTURE_INVALIDE');
    const r2 = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: 'pas une destination' } });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().erreur.code).toBe('DESTINATION_INVALIDE');
    const r3 = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: 'lnbc1garbage' } });
    expect(r3.statusCode).toBe(400);
    expect(r3.json().erreur.code).toBe('FACTURE_INVALIDE');
  });

  it('corps JSON illisible → 400 ENTREE_INVALIDE', async () => {
    const { signer } = await import('../src/securite/hmac.js');
    const corps = '{"montant_msats": ';
    const enTetes = signer((await import('./aide.js')).SECRET_TEST, { methode: 'POST', chemin: `/connexions/${id}/factures`, corps });
    const r = await app.inject({ method: 'POST', url: `/connexions/${id}/factures`, payload: corps, headers: { ...enTetes, 'content-type': 'application/json' } });
    attendreEntreeInvalide(r.statusCode, r.json());
  });

  it('corps trop volumineux → 413', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/factures`, payload: { montant_msats: 1000, description: 'x'.repeat(LIMITE_CORPS_OCTETS + 10) } });
    expect(r.statusCode).toBe(413);
    expect(r.json().erreur.code).toBe('ENTREE_INVALIDE');
  });

  it('Content-Type non JSON → 415', async () => {
    const { signer } = await import('../src/securite/hmac.js');
    const corps = 'montant=1';
    const enTetes = signer((await import('./aide.js')).SECRET_TEST, { methode: 'POST', chemin: `/connexions/${id}/factures`, corps });
    const r = await app.inject({ method: 'POST', url: `/connexions/${id}/factures`, payload: corps, headers: { ...enTetes, 'content-type': 'text/plain' } });
    expect(r.statusCode).toBe(415);
    expect(r.json().erreur.code).toBe('ENTREE_INVALIDE');
  });
});
