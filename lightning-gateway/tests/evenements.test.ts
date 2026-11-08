import { afterEach, describe, expect, it } from 'vitest';
import { Evenements } from '../src/evenements.js';
import { creerFabrique } from '../src/portefeuilles/fabrique.js';
import { Registre } from '../src/registre.js';
import { apiVers, demarrerFauxApi, evenementsRapides, journalSilencieux, type FauxApi } from './aide.js';

describe('Événements vers l’API (file de reprise)', () => {
  let fauxApi: FauxApi;
  afterEach(async () => {
    await fauxApi?.fermer();
  });

  const evenement = { type: 'payment_received' as const, id: 'demo', payment_hash: 'a'.repeat(64), montant_msats: 1000, regle_le: new Date().toISOString(), preimage: 'b'.repeat(64) };

  it('livre un événement signé (202) du premier coup', async () => {
    fauxApi = await demarrerFauxApi();
    const ev = evenementsRapides(apiVers(fauxApi));
    ev.emettre(evenement);
    await ev.vider();
    expect(fauxApi.evenements).toHaveLength(1);
    expect(fauxApi.evenements[0]).toEqual(evenement);
    expect(fauxApi.refusSignature).toBe(0);
    expect(ev.statistiques).toMatchObject({ livres: 1, abandonnes: 0, en_cours: 0 });
  });

  it('réessaie après des échecs puis livre (backoff)', async () => {
    fauxApi = await demarrerFauxApi();
    fauxApi.echecsRestants = 2;
    const ev = evenementsRapides(apiVers(fauxApi));
    ev.emettre(evenement);
    await ev.vider();
    expect(fauxApi.evenements).toHaveLength(1);
    expect(ev.statistiques.livres).toBe(1);
  });

  it('abandonne après 5 tentatives', async () => {
    fauxApi = await demarrerFauxApi();
    fauxApi.echecsRestants = 99;
    const ev = evenementsRapides(apiVers(fauxApi));
    ev.emettre(evenement);
    await ev.vider();
    expect(fauxApi.evenements).toHaveLength(0);
    expect(fauxApi.echecsRestants).toBe(94); // 5 tentatives consommées
    expect(ev.statistiques.abandonnes).toBe(1);
  });

  it('un mauvais secret est refusé par l’API (401) et finit abandonné', async () => {
    fauxApi = await demarrerFauxApi('le-secret-attendu-par-l-api-0123');
    const ev = new Evenements(apiVers(fauxApi, 'un-autre-secret-0123456789abcdef'), journalSilencieux, { delaisMs: [5, 5, 5, 5], tentativesMax: 2 });
    ev.emettre(evenement);
    await ev.vider();
    expect(fauxApi.evenements).toHaveLength(0);
    expect(fauxApi.refusSignature).toBe(2);
  });

  it('sans API_INTERNAL_URL, l’événement est ignoré sans erreur', async () => {
    fauxApi = await demarrerFauxApi();
    const ev = evenementsRapides(undefined);
    expect(() => ev.emettre(evenement)).not.toThrow();
    await ev.vider();
    expect(ev.statistiques.en_cours).toBe(0);
  });
});

describe('Réhydratation au démarrage', () => {
  let fauxApi: FauxApi;
  afterEach(async () => {
    await fauxApi?.fermer();
  });

  function registre(api: ReturnType<typeof apiVers>) {
    const fabrique = creerFabrique({ mockAutorise: true, delaiMs: 2_000, journal: journalSilencieux });
    return new Registre(fabrique, evenementsRapides(api), journalSilencieux);
  }

  it('attend que l’API réponde (reprises exponentielles) puis reprend les connexions', async () => {
    fauxApi = await demarrerFauxApi();
    fauxApi.echecsRestants = 2;
    fauxApi.connexions = [
      { id: 'boutique-a', uri: 'mock://demo' },
      { id: 'boutique-b', uri: 'mock://demo', budget_msats: 5_000 },
      { id: 'boutique-c', uri: 'https://pas-une-uri' },
    ];
    const api = apiVers(fauxApi);
    const r = registre(api);
    const resultat = await r.rehydrater(api, { delaiInitialMs: 20, delaiMaxMs: 50, tentativesMax: 10 });
    expect(fauxApi.appelsConnexions).toBe(3);
    expect(resultat).toEqual({ reprises: 2, echecs: 1 });
    expect(r.taille).toBe(2);
    expect(r.obtenir('boutique-b').budget_msats).toBe(5_000);
    expect(() => r.obtenir('boutique-c')).toThrow();
    r.fermerTout();
  });

  it('abandonne proprement si l’API ne répond jamais', async () => {
    fauxApi = await demarrerFauxApi();
    fauxApi.echecsRestants = 99;
    const api = apiVers(fauxApi);
    const r = registre(api);
    const resultat = await r.rehydrater(api, { delaiInitialMs: 5, delaiMaxMs: 10, tentativesMax: 3 });
    expect(resultat).toEqual({ reprises: 0, echecs: 0 });
    expect(r.taille).toBe(0);
  });
});
