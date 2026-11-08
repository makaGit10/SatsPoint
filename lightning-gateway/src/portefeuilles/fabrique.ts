import { erreur } from '../erreurs.js';
import type { Journal } from '../journal.js';
import type { OptionsResolution } from '../paiements/destination.js';
import { PortefeuilleMock } from './mock.js';
import { PortefeuilleNwc } from './nwc.js';
import type { Portefeuille } from './types.js';

export type OptionsFabrique = {
  mockAutorise: boolean;
  delaiMs: number;
  journal: Journal;
  resolution?: Partial<OptionsResolution>;
};

export type Fabrique = (uri: string) => Portefeuille;

const MOTIF_MOCK = /^mock:\/\/[a-z0-9-]{1,32}$/i;

/** Crée le portefeuille correspondant à une URI (`nostr+walletconnect://…` ou `mock://demo`). */
export function creerFabrique(options: OptionsFabrique): Fabrique {
  return (uri: string): Portefeuille => {
    if (typeof uri !== 'string' || uri.length === 0 || uri.length > 4096) throw erreur('URI_INVALIDE');
    if (/^mock:/i.test(uri)) {
      if (!options.mockAutorise) {
        throw erreur('URI_INVALIDE', 'Portefeuille simulé interdit en production (ALLOW_MOCK_WALLET non activé)');
      }
      if (!MOTIF_MOCK.test(uri)) throw erreur('URI_INVALIDE', 'URI simulée attendue : mock://demo');
      const opts: ConstructorParameters<typeof PortefeuilleMock>[0] = { journal: options.journal };
      if (options.resolution) opts.resolution = options.resolution;
      return new PortefeuilleMock(opts);
    }
    const opts: ConstructorParameters<typeof PortefeuilleNwc>[1] = { delaiMs: options.delaiMs, journal: options.journal };
    if (options.resolution) opts.resolution = options.resolution;
    return new PortefeuilleNwc(uri, opts);
  };
}
