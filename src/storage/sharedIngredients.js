import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { CURATED_INGREDIENTS } from '../data/curatedIngredients';

const COLLECTION = 'sharedIngredients';

/**
 * Trae todos los ingredientes compartidos, y sincroniza contra la base curada
 * del código en dos sentidos:
 *  - Agrega lo que falte (comparando por nombre).
 *  - Corrige la categoría de lo que ya existe, si en el código quedó distinta
 *    (por ejemplo, cuando movemos un ingrediente de categoría más adelante).
 * Así, cualquier reorganización que hagamos en el código se refleja sola la
 * próxima vez que alguien abre Mercader, sin pasos manuales en Firestore.
 */
export async function getAllSharedIngredients() {
  const snap = await getDocs(collection(db, COLLECTION));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const existingByName = new Map(existing.map((i) => [i.name, i]));
  const curatedByName = new Map(CURATED_INGREDIENTS.map((c) => [c.name, c]));

  const missing = CURATED_INGREDIENTS.filter((c) => !existingByName.has(c.name));
  const toFix = existing.filter((e) => {
    const curated = curatedByName.get(e.name);
    return curated && curated.category !== e.category;
  });

  if (missing.length === 0 && toFix.length === 0) return existing;

  const batch = writeBatch(db);
  const added = [];
  for (const ingredient of missing) {
    const ref = doc(collection(db, COLLECTION));
    batch.set(ref, ingredient);
    added.push({ id: ref.id, ...ingredient });
  }
  for (const item of toFix) {
    const newCategory = curatedByName.get(item.name).category;
    batch.update(doc(db, COLLECTION, item.id), { category: newCategory });
    item.category = newCategory;
  }
  await batch.commit();

  return [...existing, ...added];
}

/** Agrega un ingrediente nuevo a la base compartida (por ejemplo, cargado desde el paquete de un producto). */
export async function addSharedIngredient(data) {
  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

/** Edita un ingrediente compartido existente. */
export async function updateSharedIngredient(id, patch) {
  await updateDoc(doc(db, COLLECTION, id), patch);
}

/** Borra un ingrediente compartido. */
export async function deleteSharedIngredient(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}