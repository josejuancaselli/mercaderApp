// Funciones puras de MercaderScreen: no dependen de estado de React ni de props,
// solo de los parametros que reciben. Sacadas aparte para que sean faciles de
// ubicar y probar sueltas.

export function acsmKcal(speedKmh, inclinePct, minutes, weightKg) {
  if (speedKmh <= 0 || minutes <= 0 || !weightKg) return 0;
  const speedMmin = (speedKmh * 1000) / 60;
  const grade = inclinePct / 100;
  const isRunning = speedKmh >= 8;
  const vo2 = isRunning
    ? 0.2 * speedMmin + 0.9 * speedMmin * grade + 3.5
    : 0.1 * speedMmin + 1.8 * speedMmin * grade + 3.5;
  const kcalPerMin = (vo2 * weightKg) / 200;
  return Math.round(kcalPerMin * minutes);
}

export function calcMantenimiento(profile) {
  const { sex, age, weight, height, activity } = profile;
  const factor = activity === 'moderate' ? 1.375 : 1.2;
  const base =
    sex === 'm'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  return Math.round(base * factor);
}

/**
 * Cuánto de un ingrediente entra todavía con las monedas que quedan hoy.
 * La "unidad de referencia" para el porcentaje tapado es la unidad natural
 * del ingrediente (1 huevo, 1 cucharada) si la tiene, o 100g/ml si no —
 * así la franja gris se calibra contra lo mismo que dice el texto.
 */
export function affordInfo(item, remaining) {
  const affordG = Math.max(0, (remaining / item.kcalPer100g) * 100);
  const referenceG = item.unitAmount || 100;
  const pctCovered = Math.max(0, Math.min(100, 100 - (affordG / referenceG) * 100));

  let affordText;
  if (item.unitLabel && item.unitAmount) {
    const affordUnits = Math.floor(affordG / item.unitAmount);
    affordText = affordUnits > 0
      ? `Te alcanzan ~${affordUnits} ${item.unitLabel}${affordUnits === 1 ? '' : 's'}`
      : (affordG > 0 ? `Te alcanza menos de 1 ${item.unitLabel}` : '');
  } else {
    affordText = affordG > 0 ? `Te alcanza para ~${Math.round(affordG)}${item.unit === 'ml' ? 'ml' : 'g'}` : '';
  }

  return { affordG, pctCovered, affordText, tight: affordG > 0 && affordG <= referenceG * 0.3 };
}

export const sumKcal = (entries) => entries.reduce((sum, e) => sum + e.kcal, 0);

export const recipeTotalKcal = (recipe) =>
  recipe.mode === 'simple' ? recipe.totalKcal || 0 : (recipe.ingredients || []).reduce((s, i) => s + i.kcal, 0);

// Peso total del lote: en 'detailed' se calcula solo (suma de los ingredientes);
// en 'simple' depende del campo opcional cargado en Recetas. Sin este dato la
// receta no es porcionable y se agrega siempre completa (ver addRecipeToMeal).
export function recipeTotalWeightG(recipe) {
  if (recipe.mode === 'simple') return recipe.totalWeightG || null;
  const sum = (recipe.ingredients || []).reduce((s, i) => s + (i.amountG || 0), 0);
  return sum > 0 ? sum : null;
}