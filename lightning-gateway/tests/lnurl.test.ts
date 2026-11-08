import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Passerelle } from '../src/app.js';
import { resoudreDestination } from '../src/paiements/destination.js';
import { PortefeuilleMock } from '../src/portefeuilles/mock.js';
import { appTest, demarrerFauxLnurl, injecterSigne, journalSilencieux } from './aide.js';

describe('Résolution adresse Lightning / LNURL-pay', () => {
  let app: Passerelle;
  let lnurl: Awaited<ReturnType<typeof demarrerFauxLnurl>>;
  let destinataire: PortefeuilleMock;
  const id = 'payeur';

  beforeAll(async () => {
    destinataire = new PortefeuilleMock({ journal: journalSilencieux });
    lnurl = await demarrerFauxLnurl(destinataire, { min: 1_000, max: 500_000 });
    app = await appTest();
    await app.ready();
    await injecterSigne(app, { method: 'PUT', url: `/connexions/${id}`, payload: { uri: 'mock://demo' } });
  });

  afterAll(async () => {
    await app.close();
    await lnurl.fermer();
  });

  it('aperçu d’une adresse Lightning : bornes, description, destinataire', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: `awa@${lnurl.hote}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      type: 'adresse',
      montant_msats: 0,
      description: 'Dons à Awa',
      destinataire: 'awa@exemple.test',
      min_msats: 1_000,
      max_msats: 500_000,
    });
  });

  it('aperçu d’une URL LNURL avec montant', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: `${lnurl.url}/lnurlp`, montant_msats: 21_000 } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ type: 'lnurl', montant_msats: 21_000, min_msats: 1_000, max_msats: 500_000 });
  });

  it('paiement vers une adresse : facture demandée au service, montant vérifié, règlement', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { destination: `awa@${lnurl.hote}`, montant_msats: 21_000 } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ montant_msats: 21_000 });
    expect(lnurl.etat.dernierMontant).toBe(21_000);
    const hash = lnurl.etat.factures.at(-1)!;
    expect(r.json().payment_hash).toBe(hash);
    // Le portefeuille du destinataire (externe) ne connaît pas ce règlement : le mock payeur simule un paiement sortant.
    const facture = await destinataire.lookupInvoice(hash);
    expect(facture.statut).toBe('en_attente');
    const solde = await injecterSigne(app, { method: 'GET', url: `/connexions/${id}/solde` });
    expect(solde.json().msats).toBeLessThan(100_000_000);
  });

  it('montant hors bornes → DESTINATION_INVALIDE', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements`, payload: { destination: `awa@${lnurl.hote}`, montant_msats: 900_000 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('DESTINATION_INVALIDE');
    expect(r.json().erreur.message).toMatch(/bornes/);
  });

  it('adresse injoignable → DESTINATION_INVALIDE', async () => {
    const r = await injecterSigne(app, { method: 'POST', url: `/connexions/${id}/paiements/apercu`, payload: { destination: 'awa@127.0.0.1:9' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erreur.code).toBe('DESTINATION_INVALIDE');
  });

  it('hors test : HTTP, hôtes locaux et IP privées sont refusés (anti-SSRF)', async () => {
    const options = { reseauxAutorises: ['bc' as const] };
    for (const destination of ['http://exemple.test/lnurlp', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.1/x', 'https://172.16.0.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://intranet/x', 'awa@localhost', 'https://u:p@exemple.test/x']) {
      await expect(resoudreDestination(destination, options), destination).rejects.toMatchObject({ code: 'DESTINATION_INVALIDE' });
    }
  });

  it('LNURL bech32 est décodée vers une URL', async () => {
    const { bech32 } = await import('@scure/base');
    const url = `${lnurl.url}/lnurlp`;
    const mots = bech32.toWords(Buffer.from(url, 'utf8'));
    const encodee = bech32.encode('lnurl', mots, 2048);
    const res = await resoudreDestination(encodee, { reseauxAutorises: ['bcrt'], autoriserHttpLocal: true });
    expect(res.type).toBe('lnurl');
    if (res.type === 'lnurl') expect(res.callback).toContain('/lnurl/callback');
  });
});
