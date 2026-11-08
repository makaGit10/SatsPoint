import * as sdk from '@getalby/sdk';
import type { nwc as TypesNwc } from '../types/alby-nwc.js';

/**
 * Point d'accès unique au module NWC du SDK Alby, typé par `src/types/alby-nwc.d.ts`.
 *
 * Pourquoi : `@getalby/sdk` est publié avec `"type": "module"` mais ses `.d.ts` utilisent des imports
 * relatifs sans extension, que la résolution `NodeNext` ne peut pas suivre — ses types retombent en `any`.
 * On conserve donc une déclaration locale du sous-ensemble utilisé et on la rattache ici, en un seul endroit.
 */
export const nwc: typeof TypesNwc = (sdk as unknown as { nwc: typeof TypesNwc }).nwc;

export type { nwc as TypesNwc } from '../types/alby-nwc.js';
