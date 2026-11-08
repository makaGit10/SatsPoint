import type { ApiInterne } from './api-interne.js';
import { erreur } from './erreurs.js';
import type { Evenements } from './evenements.js';
import { abregerHash, type Journal } from './journal.js';
import type { Fabrique } from './portefeuilles/fabrique.js';
import type { PortefeuilleMock } from './portefeuilles/mock.js';
import type { InfoPortefeuille, NotificationPortefeuille, Portefeuille } from './portefeuilles/types.js';
import { attendre } from './utils/delai.js';

export type Connexion = {
  id: string;
  portefeuille: Portefeuille;
  info: InfoPortefeuille;
  mock: boolean;
  cree_le: string;
  derniere_verification: string;
  connecte: boolean;
  /** Plafond cumulé des paiements sortants (msats) côté passerelle, en complément du budget NWC. */
  budget_msats: number | undefined;
  budget_utilise_msats: number;
  budget_reserve_msats: number;
  desabonner: (() => void) | undefined;
};

export type ConnexionPublique = InfoPortefeuille & {
  connecte: boolean;
  derniere_verification: string;
  budget_msats?: number;
  budget_utilise_msats?: number;
};

export type OptionsRehydratation = {
  delaiInitialMs?: number;
  delaiMaxMs?: number;
  tentativesMax?: number;
};

/**
 * Registre en mémoire des connexions (id de boutique → portefeuille).
 * Aucune base de données : les URI arrivent de l'API (PUT ou réhydratation) et ne quittent jamais la mémoire.
 */
export class Registre {
  private readonly connexions = new Map<string, Connexion>();
  private readonly enCours = new Map<string, Promise<Connexion>>();

  constructor(
    private readonly fabrique: Fabrique,
    private readonly evenements: Evenements,
    private readonly journal: Journal,
  ) {}

  get taille(): number {
    return this.connexions.size;
  }

  aUneConnexionMock(): boolean {
    for (const c of this.connexions.values()) if (c.mock) return true;
    return false;
  }

  obtenir(id: string): Connexion {
    const c = this.connexions.get(id);
    if (!c) throw erreur('CONNEXION_INCONNUE');
    return c;
  }

  obtenirMock(id: string): PortefeuilleMock {
    const c = this.connexions.get(id);
    // Même réponse pour « inconnue » et « pas simulée » : rien à apprendre de la différence.
    if (!c || !c.mock) throw erreur('CONNEXION_INCONNUE');
    return c.portefeuille as PortefeuilleMock;
  }

  /** Vérifie par `get_info`, mémorise (en remplaçant l'éventuelle connexion précédente) et s'abonne. */
  enregistrer(id: string, uri: string, budgetMsats: number | undefined): Promise<Connexion> {
    const precedent = this.enCours.get(id);
    const tache = (precedent ?? Promise.resolve()).then(
      () => this.enregistrerInterne(id, uri, budgetMsats),
      () => this.enregistrerInterne(id, uri, budgetMsats),
    );
    this.enCours.set(id, tache);
    tache.finally(() => {
      if (this.enCours.get(id) === tache) this.enCours.delete(id);
    }).catch(() => undefined);
    return tache;
  }

  private async enregistrerInterne(id: string, uri: string, budgetMsats: number | undefined): Promise<Connexion> {
    const portefeuille = this.fabrique(uri);
    let info: InfoPortefeuille;
    try {
      info = await portefeuille.getInfo();
    } catch (e) {
      portefeuille.fermer();
      throw e;
    }
    const ancienne = this.connexions.get(id);
    if (ancienne) this.liberer(ancienne);

    const maintenant = new Date().toISOString();
    const connexion: Connexion = {
      id,
      portefeuille,
      info,
      mock: portefeuille.mock,
      cree_le: maintenant,
      derniere_verification: maintenant,
      connecte: true,
      budget_msats: budgetMsats,
      budget_utilise_msats: 0,
      budget_reserve_msats: 0,
      desabonner: undefined,
    };
    this.connexions.set(id, connexion);

    if (info.notifications.length > 0) {
      try {
        connexion.desabonner = await portefeuille.onNotification((n) => this.surNotification(connexion, n));
      } catch (e) {
        this.journal.warn({ id, erreur: e instanceof Error ? e.message : String(e) }, 'abonnement aux notifications impossible');
      }
    }
    this.journal.info(
      { id, pubkey: info.pubkey, relais: info.relais, mock: info.mock, methods: info.methods, budget_msats: budgetMsats ?? null },
      'connexion enregistrée',
    );
    return connexion;
  }

  /** Revérifie une connexion par `get_info` (met à jour l'état sans jamais la supprimer). */
  async verifier(id: string): Promise<Connexion> {
    const c = this.obtenir(id);
    try {
      c.info = await c.portefeuille.getInfo();
      c.connecte = true;
    } catch (e) {
      c.connecte = false;
      this.journal.warn({ id, erreur: e instanceof Error ? e.message : String(e) }, 'vérification de connexion en échec');
    }
    c.derniere_verification = new Date().toISOString();
    return c;
  }

  /** Mémorise le résultat d'un appel au portefeuille pour refléter `connecte`. */
  marquer(c: Connexion, ok: boolean): void {
    c.connecte = ok;
  }

  supprimer(id: string): boolean {
    const c = this.connexions.get(id);
    if (!c) return false;
    this.liberer(c);
    this.connexions.delete(id);
    this.journal.info({ id, mock: c.mock }, 'connexion supprimée');
    return true;
  }

  fermerTout(): void {
    for (const c of this.connexions.values()) this.liberer(c);
    this.connexions.clear();
  }

  versPublic(c: Connexion): ConnexionPublique {
    const p: ConnexionPublique = { ...c.info, connecte: c.connecte, derniere_verification: c.derniere_verification };
    if (c.budget_msats !== undefined) {
      p.budget_msats = c.budget_msats;
      p.budget_utilise_msats = c.budget_utilise_msats;
    }
    return p;
  }

  // --- Budget côté passerelle ----------------------------------------------

  /** Réserve un montant avant un paiement ; lève `BUDGET_DEPASSE` si le plafond serait franchi. */
  reserverBudget(c: Connexion, montantMsats: number): void {
    if (c.budget_msats === undefined) return;
    const total = c.budget_utilise_msats + c.budget_reserve_msats + montantMsats;
    if (total > c.budget_msats) {
      this.journal.warn({ id: c.id, montant_msats: montantMsats, budget_msats: c.budget_msats, utilise_msats: c.budget_utilise_msats }, 'paiement refusé : budget dépassé');
      throw erreur(
        'BUDGET_DEPASSE',
        `Budget dépassé : ${c.budget_msats - c.budget_utilise_msats} msats restants, ${montantMsats} demandés`,
      );
    }
    c.budget_reserve_msats += montantMsats;
  }

  confirmerBudget(c: Connexion, montantReserve: number, montantReel: number): void {
    if (c.budget_msats === undefined) return;
    c.budget_reserve_msats = Math.max(0, c.budget_reserve_msats - montantReserve);
    c.budget_utilise_msats += montantReel;
  }

  libererBudget(c: Connexion, montantReserve: number): void {
    if (c.budget_msats === undefined) return;
    c.budget_reserve_msats = Math.max(0, c.budget_reserve_msats - montantReserve);
  }

  // --- Réhydratation -------------------------------------------------------

  /**
   * Redemande les connexions à l'API au démarrage, avec reprises exponentielles
   * (l'API peut ne pas être prête). Ne bloque jamais le démarrage : à appeler sans `await`.
   */
  async rehydrater(api: ApiInterne, options: OptionsRehydratation = {}): Promise<{ reprises: number; echecs: number }> {
    const delaiInitial = options.delaiInitialMs ?? 2_000;
    const delaiMax = options.delaiMaxMs ?? 60_000;
    const tentativesMax = options.tentativesMax ?? 30;
    let delai = delaiInitial;
    for (let tentative = 1; tentative <= tentativesMax; tentative++) {
      let liste;
      try {
        liste = await api.listerConnexions();
      } catch (e) {
        this.journal.warn(
          { tentative, prochain_essai_ms: delai, erreur: e instanceof Error ? e.message : String(e) },
          'réhydratation : API pas encore prête',
        );
        await attendre(delai);
        delai = Math.min(delai * 2, delaiMax);
        continue;
      }
      let reprises = 0;
      let echecs = 0;
      await Promise.all(
        liste.map(async (c) => {
          try {
            await this.enregistrer(c.id, c.uri, c.budget_msats);
            reprises++;
          } catch (e) {
            echecs++;
            this.journal.warn({ id: c.id, erreur: e instanceof Error ? e.message : String(e) }, 'réhydratation : connexion non reprise');
          }
        }),
      );
      this.journal.info({ reprises, echecs, total: liste.length }, 'réhydratation terminée');
      return { reprises, echecs };
    }
    this.journal.error({ tentatives: tentativesMax }, 'réhydratation abandonnée : API injoignable');
    return { reprises: 0, echecs: 0 };
  }

  // --- Interne -------------------------------------------------------------

  private surNotification(c: Connexion, n: NotificationPortefeuille): void {
    if (this.connexions.get(c.id) !== c) return; // connexion remplacée ou supprimée entre-temps
    c.connecte = true;
    this.journal.info({ id: c.id, type: n.type, hash: abregerHash(n.payment_hash), montant_msats: n.montant_msats }, 'notification du portefeuille');
    const ev: Parameters<Evenements['emettre']>[0] = {
      type: n.type,
      id: c.id,
      payment_hash: n.payment_hash,
      montant_msats: n.montant_msats,
      regle_le: n.regle_le,
    };
    if (n.preimage) ev.preimage = n.preimage;
    this.evenements.emettre(ev);
  }

  private liberer(c: Connexion): void {
    try {
      c.desabonner?.();
    } catch {
      /* déjà désabonné */
    }
    c.desabonner = undefined;
    try {
      c.portefeuille.fermer();
    } catch {
      /* déjà fermé */
    }
  }
}
