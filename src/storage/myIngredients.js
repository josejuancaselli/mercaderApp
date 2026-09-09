import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';

function myIngredientsCollection(uid) {
  return collection(db, 'users', uid, 'myIngredients');
}

/**
 * Crea un ingrediente propio nuevo.
 * ingredient: { name, kind: 'variable' | 'fixed', kcalPer100?, kcalTotal?, unit? }
 * Devuelve el id generado por Firestore.
 */
export async function addMyIngredient(uid, ingredient) {
  const ref = await addDoc(myIngredientsCollection(uid), ingredient);
  return ref.id;
}

/** Actualiza un ingrediente propio existente (patch parcial). */
export async function updateMyIngredient(uid, ingredientId, patch) {
  await updateDoc(doc(db, 'users', uid, 'myIngredients', ingredientId), patch);
}

/** Borra un ingrediente propio. */
export async function deleteMyIngredient(uid, ingredientId) {
  await deleteDoc(doc(db, 'users', uid, 'myIngredients', ingredientId));
}

/** Trae todos los ingredientes propios del usuario. */
export async function getAllMyIngredients(uid) {
  const snap = await getDocs(myIngredientsCollection(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}