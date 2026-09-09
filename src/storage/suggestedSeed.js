import { SUGGESTED_ITEMS } from '../data/suggestedSeedList';

/**
 * Devuelve el set base de Sugeridos. Ya no depende de Firestore ni de USDA —
 * son valores fijos, así que esto es instantáneo y funciona sin conexión.
 */
export function getSuggestedItems() {
  return SUGGESTED_ITEMS;
}