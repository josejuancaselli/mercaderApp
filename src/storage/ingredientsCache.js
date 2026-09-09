import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

function cacheRef(id) {
  return doc(db, 'ingredientsCache', id);
}

/**
 * Busca un ingrediente en el cache global compartido por su id
 * (fdcId de USDA, o código de barras de Open Food Facts).
 * Devuelve null si todavía nadie lo cacheó.
 */
export async function getCachedIngredient(id) {
  const snap = await getDoc(cacheRef(id));
  return snap.exists() ? snap.data() : null;
}

/**
 * Guarda un ingrediente en el cache global, para que cualquier usuario
 * lo encuentre después sin volver a golpear la API externa.
 * data: { name, kcalPer100g, source: 'usda' | 'off' }
 */
export async function cacheIngredient(id, data) {
  await setDoc(cacheRef(id), data, { merge: true });
}