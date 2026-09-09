import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Trae el documento de perfil completo del usuario (datos físicos, déficit, meta, bankKcal, etc). */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Suma (o resta, con número negativo) al banco acumulado de calorías ahorradas. */
export async function addToBank(uid, deltaKcal) {
  await updateDoc(doc(db, 'users', uid), { bankKcal: increment(deltaKcal) });
}

/** Actualiza uno o varios campos sueltos del perfil (edición desde la pantalla de Perfil). */
export async function updateProfileFields(uid, patch) {
  await updateDoc(doc(db, 'users', uid), patch);
}