import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { updateProfileFields } from './profile';

function weightLogRef(uid, dateId) {
  return doc(db, 'users', uid, 'weightLogs', dateId);
}

/** Trae todos los registros de peso, ordenados de más antiguo a más reciente. Para Historial. */
export async function getAllWeightLogs(uid) {
  const q = query(collection(db, 'users', uid, 'weightLogs'), orderBy('__name__', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ date: d.id, weight: d.data().weight }));
}

/**
 * Única fuente de verdad para "el peso actual": siempre el registro con la
 * fecha más reciente en weightLogs. Se llama después de cualquier alta o
 * borrado, para que users/{uid}.weight (de donde Mercader y Perfil calculan
 * el mantenimiento) quede sincronizado sin importar desde qué pantalla se
 * cargó, editó o borró el registro.
 */
async function syncCurrentWeight(uid) {
  const logs = await getAllWeightLogs(uid);
  if (logs.length === 0) return;
  const latest = logs[logs.length - 1];
  await updateProfileFields(uid, { weight: latest.weight });
}

/** Carga o sobreescribe el peso registrado para una fecha (YYYY-MM-DD), y sincroniza el peso actual del perfil. */
export async function setWeightLog(uid, dateId, weight) {
  await setDoc(weightLogRef(uid, dateId), { weight });
  await syncCurrentWeight(uid);
}

/** Trae el peso registrado en una fecha puntual, o null si no hay registro ese día. */
export async function getWeightLog(uid, dateId) {
  const snap = await getDoc(weightLogRef(uid, dateId));
  return snap.exists() ? snap.data().weight : null;
}

/** Borra el registro de peso de una fecha, y sincroniza el peso actual del perfil con lo que quede. */
export async function deleteWeightLog(uid, dateId) {
  await deleteDoc(weightLogRef(uid, dateId));
  await syncCurrentWeight(uid);
}