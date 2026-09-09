import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

function dayHistoryRef(uid, dayId) {
  return doc(db, 'users', uid, 'dayHistory', dayId);
}

/**
 * Archiva el resultado final de un día ya cerrado (llamar antes de resetear days/{dayId}).
 * hardCap: mantenimiento + boost de ejercicio de ESE día (no el actual, para que
 * cambios futuros de perfil no reescriban el historial).
 */
export async function setDayHistory(uid, dayId, { kcalConsumed, exerciseBoostKcal, hardCap, leftover }) {
  await setDoc(dayHistoryRef(uid, dayId), { kcalConsumed, exerciseBoostKcal, hardCap, leftover });
}

/** Trae todo el historial de días cerrados, ordenado de más antiguo a más reciente. Para Historial. */
export async function getAllDayHistory(uid) {
  const q = query(collection(db, 'users', uid, 'dayHistory'), orderBy('__name__', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ date: d.id, ...d.data() }));
}