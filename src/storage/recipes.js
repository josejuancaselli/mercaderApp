import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';

function recipesCollection(uid) {
  return collection(db, 'users', uid, 'recipes');
}

/**
 * Crea una receta nueva.
 * recipe: { name, mode: 'detailed' | 'simple', ingredients?: [...], totalKcal? }
 * Devuelve el id generado por Firestore.
 */
export async function addRecipe(uid, recipe) {
  const ref = await addDoc(recipesCollection(uid), recipe);
  return ref.id;
}

/** Actualiza una receta existente (patch parcial). */
export async function updateRecipe(uid, recipeId, patch) {
  await updateDoc(doc(db, 'users', uid, 'recipes', recipeId), patch);
}

/** Borra una receta. */
export async function deleteRecipe(uid, recipeId) {
  await deleteDoc(doc(db, 'users', uid, 'recipes', recipeId));
}

/** Trae todas las recetas guardadas por el usuario. */
export async function getAllRecipes(uid) {
  const snap = await getDocs(recipesCollection(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}