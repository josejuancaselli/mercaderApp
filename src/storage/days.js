import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Devuelve el id del "día lógico" actual en formato YYYY-MM-DD, en hora local.
 * El corte del día no es a medianoche sino a las 4 AM: comer o cargar algo
 * entre las 00:00 y las 03:59 sigue contando como el día anterior, para que
 * una cena o merienda tarde no quede huérfana en un documento nuevo vacío.
 */
export function todayId() {
  const now = new Date();
  const shifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRef(uid, dayId) {
  return doc(db, 'users', uid, 'days', dayId);
}

const EMPTY_DAY = { entries: [], exerciseBoostKcal: 0, kcalConsumed: 0 };

/** Trae el documento del día. Si no existe todavía, devuelve un día vacío (sin crear nada en Firestore). */
export async function getDay(uid, dayId) {
  const snap = await getDoc(dayRef(uid, dayId));
  if (!snap.exists()) return { ...EMPTY_DAY };
  return { ...EMPTY_DAY, ...snap.data() };
}

function recalcKcal(entries) {
  return entries.reduce((sum, e) => sum + e.kcal, 0);
}

/**
 * Agrega un ingrediente al día.
 * entry: { ingredientId, name, kcalPer100g, amountG, kcal, mealType }
 * Guardamos kcalPer100g en la entrada para poder recalcular kcal si después se edita la cantidad.
 */
export async function addEntry(uid, dayId, entry) {
  const day = await getDay(uid, dayId);
  const newEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    addedAt: Date.now(),
  };
  const entries = [...day.entries, newEntry];
  const updated = { ...day, entries, kcalConsumed: recalcKcal(entries) };
  await setDoc(dayRef(uid, dayId), updated);
  return updated;
}

/** Quita un ingrediente del día por su id. */
export async function removeEntry(uid, dayId, entryId) {
  const day = await getDay(uid, dayId);
  const entries = day.entries.filter((e) => e.id !== entryId);
  const updated = { ...day, entries, kcalConsumed: recalcKcal(entries) };
  await setDoc(dayRef(uid, dayId), updated);
  return updated;
}

/** Cambia la cantidad de un ingrediente ya cargado; recalcula sus kcal usando el kcalPer100g guardado. */
export async function updateEntryAmount(uid, dayId, entryId, newAmountG) {
  const day = await getDay(uid, dayId);
  const entries = day.entries.map((e) =>
    e.id === entryId
      ? { ...e, amountG: newAmountG, kcal: Math.round((e.kcalPer100g * newAmountG) / 100) }
      : e
  );
  const updated = { ...day, entries, kcalConsumed: recalcKcal(entries) };
  await setDoc(dayRef(uid, dayId), updated);
  return updated;
}

/** Guarda el boost de calorías por ejercicio del día. */
export async function setExerciseBoost(uid, dayId, exerciseBoostKcal) {
  const day = await getDay(uid, dayId);
  const updated = { ...day, exerciseBoostKcal };
  await setDoc(dayRef(uid, dayId), updated);
  return updated;
}

/** Reinicia el día a vacío en un solo viaje a Firestore (usado al cerrar el día). */
export async function resetDay(uid, dayId) {
  const empty = { ...EMPTY_DAY };
  await setDoc(dayRef(uid, dayId), empty);
  return empty;
}

/**
 * Guarda un objeto de día ya armado, en un solo viaje (sin leer antes).
 * Para usar junto con actualización optimista: la pantalla ya calculó el
 * nuevo estado en memoria, esto solo lo persiste en Firestore de fondo.
 */
export async function saveDay(uid, dayId, dayData) {
  await setDoc(dayRef(uid, dayId), dayData);
}