import type { ApiInterne, EvenementApi } from './api-interne.js';
import { abregerHash, type Journal } from './journal.js';
import { attendre } from './utils/delai.js';

export type EvenementPaiement = EvenementApi;

/** Reprises : 5 tentatives au total, attente croissante entre deux tentatives. */
export const DELAIS_REPRISE_MS: readonly number[] = [1_000, 3_000, 8_000, 20_000];
export const TENTATIVES_MAX = 5;

/**
 * File d'envoi des événements de portefeuille vers l'API (`POST /internal/lightning/evenement`, signé).
 * En mémoire : si la passerelle redémarre, l'API retrouve de toute façon l'état réel par `lookup_invoice`
 * (vérification périodique côté API, cf. cahier des charges § 6.4).
 */
export class Evenements {
  private readonly enCours = new Set<Promise<void>>();
  private readonly delais: readonly number[];
  private readonly tentativesMax: number;
  private readonly maxEnCours: number;
  private abandonnes = 0;
  private livres = 0;

  constructor(
    private readonly api: ApiInterne | undefined,
    private readonly journal: Journal,
    options: { delaisMs?: readonly number[]; tentativesMax?: number; maxEnCours?: number } = {},
  ) {
    this.delais = options.delaisMs ?? DELAIS_REPRISE_MS;
    this.tentativesMax = options.tentativesMax ?? TENTATIVES_MAX;
    this.maxEnCours = options.maxEnCours ?? 1_000;
  }

  get statistiques(): { en_cours: number; livres: number; abandonnes: number } {
    return { en_cours: this.enCours.size, livres: this.livres, abandonnes: this.abandonnes };
  }

  /** Envoi asynchrone (ne bloque jamais l'appelant). */
  emettre(ev: EvenementPaiement): void {
    if (!this.api) {
      this.journal.warn(
        { id: ev.id, type: ev.type, hash: abregerHash(ev.payment_hash) },
        'API_INTERNAL_URL absente : événement non transmis',
      );
      return;
    }
    if (this.enCours.size >= this.maxEnCours) {
      this.abandonnes++;
      this.journal.error({ id: ev.id, type: ev.type, hash: abregerHash(ev.payment_hash) }, 'file d’événements saturée');
      return;
    }
    const tache = this.livrer(ev).finally(() => this.enCours.delete(tache));
    this.enCours.add(tache);
  }

  /** Attend la fin de toutes les livraisons en cours (tests, arrêt propre). */
  async vider(): Promise<void> {
    while (this.enCours.size > 0) {
      await Promise.allSettled([...this.enCours]);
    }
  }

  private async livrer(ev: EvenementPaiement): Promise<void> {
    const contexte = { id: ev.id, type: ev.type, hash: abregerHash(ev.payment_hash), montant_msats: ev.montant_msats };
    for (let tentative = 1; tentative <= this.tentativesMax; tentative++) {
      try {
        await this.api!.envoyerEvenement(ev);
        this.livres++;
        this.journal.info({ ...contexte, tentative }, 'événement transmis à l’API');
        return;
      } catch (e) {
        const derniere = tentative === this.tentativesMax;
        this.journal[derniere ? 'error' : 'warn'](
          { ...contexte, tentative, erreur: messageSur(e) },
          derniere ? 'événement abandonné après reprises' : 'échec d’envoi de l’événement, reprise prévue',
        );
        if (derniere) {
          this.abandonnes++;
          return;
        }
        await attendre(this.delais[Math.min(tentative - 1, this.delais.length - 1)] ?? 1_000);
      }
    }
  }
}

function messageSur(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
