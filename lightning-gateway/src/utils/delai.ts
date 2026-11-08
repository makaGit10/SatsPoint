import { erreur } from '../erreurs.js';

/**
 * Borne une promesse dans le temps. Au-delà du délai, rejette avec `DELAI_DEPASSE`.
 * La promesse d'origine continue en arrière-plan : on ne peut pas annuler un appel NIP-47
 * déjà publié, mais on libère immédiatement l'appelant.
 */
export function avecDelai<T>(promesse: Promise<T>, delaiMs: number, operation = 'appel au portefeuille'): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const minuteur = setTimeout(() => {
      rejeter(erreur('DELAI_DEPASSE', `Délai de ${Math.round(delaiMs / 1000)} s dépassé (${operation})`));
    }, delaiMs);
    promesse.then(
      (v) => {
        clearTimeout(minuteur);
        resoudre(v);
      },
      (e: unknown) => {
        clearTimeout(minuteur);
        rejeter(e);
      },
    );
  });
}

export function attendre(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
