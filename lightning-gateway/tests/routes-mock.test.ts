import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Passerelle } from '../src/app.js';
import { decoderBolt11 } from '../src/portefeuilles/bolt11.js';
import { SOLDE_INITIAL_MSATS } from '../src/portefeuilles/mock.js';
import { apiVers, appTest, demarrerFauxApi, evenementsRapides, injecterSigne, type FauxApi } from './aide.js';

/**
 * Parcours complet avec le portefeuille simulé :
 * créer une facture → lookup en attente → payer via /mock → lookup réglée → événement reçu par l'API.
 */
describe('Routes avec le portefeuille simulé (mock://demo)', () => {
  let app: Passerelle;
  let fauxApi: FauxApi;
  const id = '01JCDEMO0000000000000000AB';

  beforeAll(async () => {
    fauxApi = await demarrerFauxApi();
    const api = apiVers(fauxApi);
    app = await appTest({ api, evenements: evenementsRapides(api) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await fauxApi.fermer();
  });

  it('GET /sante répond sans HMAC', async () => {
    const r = await app.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, connexions: 0, mock: false });
    expect(typeof r.json().uptime_s).toBe('number');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('PUT /connexions/{id} enregistre un portefeuille simulé', async () => {
    const r = await injecterSigne(app, { method: 'PUT', url: `/connexions/${id}`, payload: { uri: 'mock://demo' } });
    expect(r.statusCode).toBe(200);
    const corps = r.json();
    expect(corps).toMatchObject({ mock: true, relais: [], alias: 'Portefeuille simulé SatsPoint' });
    expect(corps.pubkey).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(corps.methods).toEqual(expect.arrayContaining(['make_invoice', 'lookup_invoice', 'get_balance', 'pay_invoice']));
    expect(corps.notifications).toEqual(['payment_received', 'payment_sent']);
    expect(corps).not.toHaveProperty('uri');
    expect(corps).not.toHaveProperty('connecte');

    const sante = await app.inject({ method: 'GET', url: '/sante' });
    expect(sante.json()).toMatchObject({ connexions: 1, mock: true });
  });

  it('GET /connexions/{id} renvoie l’état de connexion', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ mock: true, connecte: true });
    expect(typeof r.json().derniere_verification).toBe('string');
    const sans = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}?verifier=false` });
    expect(sans.statusCode).toBe(200);
  });

  it('GET /connexions/{id}/solde renvoie 100 000 sats au départ', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/solde` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ msats: SOLDE_INITIAL_MSATS });
  });

  let paymentHash = '';
  let bolt11 = '';

  it('POST /connexions/{id}/factures crée une facture BOLT11 regtest valide', async () => {
    const r = await injecterSigne(app, {
      method: 'POST',
      url: `/connexions/${id}/factures`,
      payload: { montant_msats: 225_000, description: 'SatsPoint · Boutique Démo · 42', expiration_s: 600 },
    });
    expect(r.statusCode).toBe(201);
    const f = r.json();
    expect(f.bolt11).toMatch(/^lnbcrt2250n1/);
    expect(f.payment_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.montant_msats).toBe(225_000);
    expect(new Date(f.expire_le).getTime() - new Date(f.cree_le).getTime()).toBe(600_000);
    const d = decoderBolt11(f.bolt11);
    expect(d.reseau).toBe('bcrt');
    expect(d.payment_hash).toBe(f.payment_hash);
    expect(d.montant_msats).toBe(225_000);
    expect(d.description).toBe('SatsPoint · Boutique Démo · 42');
    paymentHash = f.payment_hash;
    bolt11 = f.bolt11;
  });

  it('GET /connexions/{id}/factures/{hash} → en_attente, sans preimage', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/factures/${paymentHash}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ payment_hash: paymentHash, statut: 'en_attente', montant_msats: 225_000 });
    expect(r.json()).not.toHaveProperty('preimage');
    expect(r.json()).not.toHaveProperty('regle_le');
  });

  it('GET facture inconnue → 404 FACTURE_INCONNUE', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/factures/${'0'.repeat(64)}` });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erreur: { code: 'FACTURE_INCONNUE', message: expect.any(String) } });
  });

  it('POST /mock/{id}/payer/{hash} règle la facture et émet payment_received vers l’API', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/mock/${id}/payer/${paymentHash}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });

    const lookup = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/factures/${paymentHash}` });
    const f = lookup.json();
    expect(f.statut).toBe('reglee');
    expect(f.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update(Buffer.from(f.preimage, 'hex')).digest('hex')).toBe(paymentHash);
    expect(typeof f.regle_le).toBe('string');

    const [ev] = await fauxApi.attendreEvenements(1);
    expect(ev).toMatchObject({ type: 'payment_received', id, payment_hash: paymentHash, montant_msats: 225_000, preimage: f.preimage });
    expect(fauxApi.refusSignature).toBe(0);

    const solde = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/solde` });
    expect(solde.json()).toEqual({ msats: SOLDE_INITIAL_MSATS + 225_000 });
  });

  it('payer deux fois est idempotent (pas de second événement)', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/mock/${id}/payer/${paymentHash}` });
    expect(r.statusCode).toBe(200);
    await new Promise((res) => setTimeout(res, 100));
    expect(fauxApi.evenements.length).toBe(1);
  });

  it('GET /connexions/{id}/transactions liste l’entrée réglée', async () => {
    const r = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/transactions?limite=10&type=entrante` });
    expect(r.statusCode).toBe(200);
    const { transactions } = r.json();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: 'entrante',
      statut: 'reglee',
      montant_msats: 225_000,
      frais_msats: 0,
      payment_hash: paymentHash,
      description: 'SatsPoint · Boutique Démo · 42',
    });
    expect(typeof transactions[0].regle_le).toBe('string');
    expect(typeof transactions[0].cree_le).toBe('string');
  });

  it('payer une facture déjà réglée via /paiements → FACTURE_INVALIDE', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { bolt11 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('FACTURE_INVALIDE');
  });

  it('aperçu puis paiement d’une facture d’une autre connexion simulée (payment_sent émis)', async () => {
    const autre = 'boutique-b';
    await injecterSigne(app, { method: 'PUT', url: `/connexions/${autre}`, payload: { uri: 'mock://demo' } });
    const facture = (
      await injecterSigne(app, { method: 'POST', url: `/connexions/${autre}/factures`, payload: { montant_msats: 50_000, description: 'Café' } })
    ).json();

    const apercu = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: facture.bolt11 } });
    expect(apercu.statusCode).toBe(200);
    expect(apercu.json()).toMatchObject({ type: 'bolt11', montant_msats: 50_000, description: 'Café', payment_hash: facture.payment_hash });

    const avant = fauxApi.evenements.length;
    const paiement = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { bolt11: facture.bolt11 } });
    expect(paiement.statusCode).toBe(200);
    const p = paiement.json();
    expect(p).toMatchObject({ payment_hash: facture.payment_hash, montant_msats: 50_000 });
    expect(p.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(p.frais_msats).toBeGreaterThanOrEqual(1_000);

    await fauxApi.attendreEvenements(avant + 1);
    const sortant = fauxApi.evenements.find((e) => e.type === 'payment_sent' && e.id === id);
    expect(sortant).toMatchObject({ payment_hash: facture.payment_hash, montant_msats: 50_000 });

    const sortantes = (await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/transactions?type=sortante` })).json();
    expect(sortantes.transactions[0]).toMatchObject({ type: 'sortante', montant_msats: 50_000, frais_msats: p.frais_msats });
    await injecterSigne(app, { method: 'DELETE', url: `/connexions/${autre}` });
  });

  it('SOLDE_INSUFFISANT quand le montant dépasse le solde', async () => {
    const autre = 'boutique-c';
    await injecterSigne(app, { method: 'PUT', url: `/connexions/${autre}`, payload: { uri: 'mock://demo' } });
    const facture = (
      await injecterSigne(app, { method: 'POST', url: `/connexions/${autre}/factures`, payload: { montant_msats: 900_000_000, description: 'trop' } })
    ).json();
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { bolt11: facture.bolt11 } });
    expect(r.statusCode).toBe(402);
    expect(r.json().erreur.code).toBe('SOLDE_INSUFFISANT');
    await injecterSigne(app, { method: 'DELETE', url: `/connexions/${autre}` });
  });

  it('BUDGET_DEPASSE avec un budget_msats transmis dans PUT', async () => {
    const payeur = 'boutique-budget';
    const r0 = await injecterSigne(app, { method: 'PUT', url: `/connexions/${payeur}`, payload: { uri: 'mock://demo', budget_msats: 60_000 } });
    expect(r0.statusCode).toBe(200);
    expect(r0.json().budget_msats).toBe(60_000);

    const f1 = (await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/factures`, payload: { montant_msats: 40_000, description: 'a' } })).json();
    const p1 = await injecterSigne(app, { method: 'POST', url: `/connexions/${payeur}/paiements`, payload: { bolt11: f1.bolt11 } });
    expect(p1.statusCode).toBe(200);

    const f2 = (await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/factures`, payload: { montant_msats: 40_000, description: 'b' } })).json();
    const p2 = await injecterSigne(app, { method: 'POST', url: `/connexions/${payeur}/paiements`, payload: { bolt11: f2.bolt11 } });
    expect(p2.statusCode).toBe(403);
    expect(p2.json().erreur.code).toBe('BUDGET_DEPASSE');

    const etat = (await injecterSigne(app, { method: 'GET', url: `/connexions/${payeur}?verifier=false` })).json();
    expect(etat.budget_msats).toBe(60_000);
    expect(etat.budget_utilise_msats).toBeGreaterThanOrEqual(40_000);
    await injecterSigne(app, { method: 'DELETE', url: `/connexions/${payeur}` });
  });

  it('DELETE /connexions/{id} → 204 puis CONNEXION_INCONNUE', async () => {
    const r = await injecterSigne(app, { method: 'DELETE', url: `/connexions/${id}` });
    expect(r.statusCode).toBe(204);
    const apres = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/solde` });
    expect(apres.statusCode).toBe(404);
    expect(apres.json()).toEqual({ erreur: { code: 'CONNEXION_INCONNUE', message: expect.any(String) } });
    const encore = await injecterSigne(app, { method: 'DELETE', url: `/connexions/${id}` });
    expect(encore.statusCode).toBe(204);
  });
});
