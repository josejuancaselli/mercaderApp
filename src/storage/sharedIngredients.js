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
 *  - Corrige la categoría y los datos de unidad (unitLabel/unitAmount) de lo
 *    que ya existe, si en el código quedaron distintos — por ejemplo, cuando
 *    movemos un ingrediente de categoría, o le sumamos una unidad más
 *    adelante (como "1 huevo = 50g").
 * El kcalPer100g NUNCA se pisa acá: si ya existe en Firestore, se respeta
 * (por si alguien lo corrigió a mano en la consola), y solo se usa el valor
 * del código para los ingredientes que todavía no existen.
 */
export async function getAllSharedIngredients() {
  const snap = await getDocs(collection(db, COLLECTION));
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const existingByName = new Map(existing.map((i) => [i.name, i]));
  const curatedByName = new Map(CURATED_INGREDIENTS.map((c) => [c.name, c]));

  const missing = CURATED_INGREDIENTS.filter((c) => !existingByName.has(c.name));
  const toFix = existing
    .map((e) => {
      const curated = curatedByName.get(e.name);
      if (!curated) return null;
      const patch = {};
      if (curated.category !== e.category) patch.category = curated.category;
      if ((curated.unitLabel || null) !== (e.unitLabel || null)) patch.unitLabel = curated.unitLabel || null;
      if ((curated.unitAmount || null) !== (e.unitAmount || null)) patch.unitAmount = curated.unitAmount || null;
      if ((curated.unit || null) !== (e.unit || null)) patch.unit = curated.unit || null;
      return Object.keys(patch).length > 0 ? { item: e, patch } : null;
    })
    .filter(Boolean);

  if (missing.length === 0 && toFix.length === 0) return existing;

  const batch = writeBatch(db);
  const added = [];
  for (const ingredient of missing) {
    const ref = doc(collection(db, COLLECTION));
    batch.set(ref, ingredient);
    added.push({ id: ref.id, ...ingredient });
  }
  for (const { item, patch } of toFix) {
    batch.update(doc(db, COLLECTION, item.id), patch);
    Object.assign(item, patch);
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