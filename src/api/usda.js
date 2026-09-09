import { getCachedIngredient, cacheIngredient } from '../storage/ingredientsCache';

const API_KEY = '3V5bkgDSToDslwWQhiHNmX8SYOe76c8oxe0IvEvj';
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// Diccionario chico de términos comunes en español → inglés, para que el buscador
// funcione con lo más habitual sin que el usuario tenga que escribir en inglés.
// No cubre todo — lo que no está en el diccionario se busca tal cual lo escribió el usuario.
const ES_EN_DICTIONARY = {
  pollo: 'chicken', carne: 'beef', cerdo: 'pork', pescado: 'fish', atun: 'tuna',
  huevo: 'egg', huevos: 'eggs', leche: 'milk', queso: 'cheese', yogur: 'yogurt',
  manteca: 'butter', pan: 'bread', arroz: 'rice', fideos: 'pasta', avena: 'oats',
  banana: 'banana', manzana: 'apple', naranja: 'orange', pera: 'pear', uva: 'grape',
  frutilla: 'strawberry', durazno: 'peach', sandia: 'watermelon', melon: 'melon',
  papa: 'potato', batata: 'sweet potato', cebolla: 'onion', tomate: 'tomato',
  lechuga: 'lettuce', zanahoria: 'carrot', espinaca: 'spinach', brocoli: 'broccoli',
  morron: 'bell pepper', pepino: 'cucumber', ajo: 'garlic', zapallo: 'squash',
  remolacha: 'beet', choclo: 'corn', lenteja: 'lentil', lentejas: 'lentils',
  garbanzo: 'chickpea', garbanzos: 'chickpeas', porotos: 'beans', nuez: 'walnut',
  nueces: 'walnuts', mani: 'peanut', almendra: 'almond', jamon: 'ham',
  salchicha: 'sausage', chorizo: 'sausage', miel: 'honey', azucar: 'sugar',
  aceite: 'oil', palta: 'avocado', ananá: 'pineapple', ananas: 'pineapple',
};

function translateQuery(text) {
  const lower = text.trim().toLowerCase();
  return ES_EN_DICTIONARY[lower] || text;
}

function extractKcalPer100g(foodNutrients) {
  const energy = foodNutrients?.find(
    (n) => n.nutrientName === 'Energy' && n.unitName === 'KCAL'
  );
  return energy ? Math.round(energy.value) : null;
}

/**
 * Busca alimentos por texto en USDA. Traduce automáticamente los términos
 * más comunes en español antes de buscar (USDA solo entiende inglés).
 * Devuelve: [{ fdcId, name, kcalPer100g }]
 */
export async function searchIngredients(queryText) {
  const translated = translateQuery(queryText);
  const url = `${BASE_URL}/foods/search?api_key=${API_KEY}&query=${encodeURIComponent(
    translated
  )}&pageSize=20&dataType=Foundation,SR%20Legacy`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo conectar con USDA');
  const data = await res.json();

  return (data.foods || [])
    .map((food) => ({
      fdcId: String(food.fdcId),
      name: food.description,
      kcalPer100g: extractKcalPer100g(food.foodNutrients),
    }))
    .filter((food) => food.kcalPer100g !== null);
}

/**
 * Trae un ingrediente por su fdcId, usando el cache global de Firestore primero.
 */
export async function getIngredientByFdcId(fdcId, fallbackName, fallbackKcal) {
  const cached = await getCachedIngredient(fdcId);
  if (cached) return cached;

  if (fallbackName && fallbackKcal != null) {
    const data = { name: fallbackName, kcalPer100g: fallbackKcal, source: 'usda' };
    await cacheIngredient(fdcId, data);
    return data;
  }

  const url = `${BASE_URL}/food/${fdcId}?api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo conectar con USDA');
  const food = await res.json();

  const data = {
    name: food.description,
    kcalPer100g: extractKcalPer100g(food.foodNutrients),
    source: 'usda',
  };
  await cacheIngredient(fdcId, data);
  return data;
}