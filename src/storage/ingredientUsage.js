import { doc, getDoc, setDoc, increment, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

function usageRef(uid, ingredientKey) {
  return doc(db, 'users', uid, 'ingredientUsage', ingredientKey);
}

/**
 * Registra que el usuario usó un ingrediente (sea de Sugeridos, Buscar, o Mis Ingredientes).
 * ingredientKey: el fdcId de USDA, o el id del documento de myIngredients.
 * Suma 1 al contador si ya existía, o lo crea en 1 si es la primera vez.
 */
export async function recordUsage(uid, ingredientKey, { name, kcalPer100g, source }) {
  await setDoc(
    usageRef(uid, ingredientKey),
    { name, kcalPer100g, source, count: increment(1), lastUsedAt: Date.now() },
    { merge: true }
  );
}

/**
 * Trae los ingredientes más usados por el usuario, de más a menos usado.
 * Se combinan con el set base de Sugeridos en la pantalla de Mercader (no acá).
 */
export async function getTopUsage(uid, max = 30) {
  const q = query(
    collection(db, 'users', uid, 'ingredientUsage'),
    orderBy('count', 'desc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ingredientKey: d.id, ...d.data() }));
}