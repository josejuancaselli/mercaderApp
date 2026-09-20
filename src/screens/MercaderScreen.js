import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, addToBank, updateProfileFields } from '../storage/profile';
import { getDay, saveDay, resetDay, todayId } from '../storage/days';
import { setDayHistory } from '../storage/dayHistory';
import { setWeightLog } from '../storage/weightLogs';
import { getAllRecipes } from '../storage/recipes';
import { getAllSharedIngredients } from '../storage/sharedIngredients';
import { getAllMyIngredients } from '../storage/myIngredients';
import { CATEGORIES } from '../data/curatedIngredients';
import { getTopUsage, recordUsage } from '../storage/ingredientUsage';
import { colors } from '../theme/colors';
import { acsmKcal, calcMantenimiento, affordInfo, sumKcal, recipeTotalKcal, recipeTotalWeightG } from './helpers/mercaderLogic';
import { styles } from './styles/MercaderScreenStyles';
import { useFocusEffect } from '@react-navigation/native';

const MEALS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];
const KCAL_PER_KG = 7700;

/* Gimnasio: monto fijo por sesión, sin variables de peso/tiempo/intensidad
   (no existe una fórmula de METs para musculación con la misma certeza que caminata/carrera). */
const GYM_FIXED_KCAL = 200;

/* Ecuación metabólica ACSM (caminata para <8km/h, carrera para >=8km/h ~5mph).
   VO2 en ml/kg/min; kcal/min = VO2 × peso(kg) / 200. */
export default function MercaderScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [day, setDay] = useState({ entries: [], exerciseBoostKcal: 0, kcalConsumed: 0 });
  const [favorites, setFavorites] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedSearchItem, setSelectedSearchItem] = useState(null);
  const [searchAmount, setSearchAmount] = useState('');
  const [searchUnitMode, setSearchUnitMode] = useState('g'); // 'g' | 'unit'
  const [quantityModalItem, setQuantityModalItem] = useState(null);
  const [quantityModalAmount, setQuantityModalAmount] = useState('');
  const [quantityModalUnitMode, setQuantityModalUnitMode] = useState('g'); // 'g' | 'unit'
  const [activeMeal, setActiveMeal] = useState('Desayuno');
  const [activeCategory, setActiveCategory] = useState(null);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [exerciseType, setExerciseType] = useState('cardio');
  const [cardioSpeed, setCardioSpeed] = useState('5.0');
  const [cardioIncline, setCardioIncline] = useState('0');
  const [cardioMinutes, setCardioMinutes] = useState('30');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closeWeightInput, setCloseWeightInput] = useState('');
  const [pendingDay, setPendingDay] = useState(null); // { id, entries, exerciseBoostKcal, kcalConsumed } | null
  const [pendingDayClosing, setPendingDayClosing] = useState(false);
  const scrollRef = useRef(null);
  const celebrationScale = useRef(new Animated.Value(0)).current;
  const [confettiReady, setConfettiReady] = useState(false);

  const handleCelebrationShow = () => {
    celebrationScale.setValue(0);
    Animated.spring(celebrationScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
    setConfettiReady(true);
  };

  const closeCelebration = () => {
    setConfettiReady(false);
    setCelebration(null);
  };

  const [celebration, setCelebration] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const today = todayId();
    const [profileData, dayData, usage, sharedIngredients, myIngredientsData, recipesData] = await Promise.all([
      getUserProfile(user.uid),
      getDay(user.uid, today),
      getTopUsage(user.uid, 8),
      getAllSharedIngredients(),
      getAllMyIngredients(user.uid),
      getAllRecipes(user.uid),
    ]);
    setProfile(profileData);
    setDay(dayData);
    setFavorites(usage.filter((u) => u.kcalPer100g != null));

    // Detección de día abandonado: si la última vez que se usó Mercader fue
    // un día lógico distinto al de hoy, y ese día tenía algo cargado (comida
    // o actividad física) que nunca se cerró con "Guardar en el Banco", ese
    // ahorro se perdió en el aire — nadie lo acreditó ni lo archivó. Antes de
    // mostrar el día de hoy, se detecta ese caso y se avisa con un modal en
    // vez de dejarlo pasar en silencio.
    const lastOpenDayId = profileData?.lastOpenDayId;
    if (lastOpenDayId && lastOpenDayId !== today) {
      const oldDay = await getDay(user.uid, lastOpenDayId);
      const hadActivity = oldDay.entries.length > 0 || (oldDay.exerciseBoostKcal || 0) > 0;
      if (hadActivity) {
        setPendingDay({ id: lastOpenDayId, ...oldDay });
      } else {
        setPendingDay(null);
        updateProfileFields(user.uid, { lastOpenDayId: today }).catch((e) => console.warn('No se pudo actualizar el puntero de día:', e.message));
      }
    } else {
      setPendingDay(null);
      if (lastOpenDayId !== today) {
        updateProfileFields(user.uid, { lastOpenDayId: today }).catch((e) => console.warn('No se pudo actualizar el puntero de día:', e.message));
      }
    }

    // Los ingredientes propios (creados desde Recetas → "Mis ingredientes") se
    // mezclan con los compartidos, igual que ya hace el armador de recetas.
    // Se excluyen los que todavía no tienen una tasa por 100g/ml calculada
    // (ingredientes viejos del formato "cantidad fija" anterior a este cambio,
    // que no guardaban el peso de la unidad y no se pueden convertir solos —
    // hay que volver a guardarlos desde Recetas con el nuevo formato).
    const personalAsShared = myIngredientsData
      .filter((i) => i.kcalPer100)
      .map((i) => ({
        id: i.id,
        name: i.name,
        brand: i.brand || null,
        emoji: '🧾',
        category: i.category || 'Otros',
        kcalPer100g: i.kcalPer100,
        unitLabel: i.unitLabel || null,
        unitAmount: i.unitAmount || null,
      }));
    setIngredients([...sharedIngredients, ...personalAsShared]);
    setRecipes(recipesData);
    setLoading(false);
  }, [user.uid]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const mantenimiento = profile.useCustomTdee ? (profile.customTdee || 0) : calcMantenimiento(profile);
  const deficit = profile.deficit ?? 300;
  const target = mantenimiento - deficit;
  const hardCap = mantenimiento + (day.exerciseBoostKcal || 0);
  const remaining = Math.max(0, hardCap - day.kcalConsumed);
  const boosted = (day.exerciseBoostKcal || 0) > 0;
  const inAmberZone = day.kcalConsumed > target;
  const today = todayId();

  // Barra que se VACÍA: el relleno representa lo que queda (remaining), no lo gastado.
  const fillPct = Math.max(0, Math.min(100, (remaining / hardCap) * 100));
  const markerLeftPct = Math.max(0, Math.min(100, ((hardCap - target) / hardCap) * 100));

  // Todas las mutaciones de acá siguen el mismo patrón: calculamos el nuevo
  // estado en memoria y lo mostramos YA (setDay/setProfile inmediato); el
  // guardado en Firestore sale disparado de fondo, sin que el toque espere
  // esa vuelta de red — así no hay delay perceptible al usar la app.

  const openQuantityModal = (item) => {
    setQuantityModalItem(item);
    setQuantityModalUnitMode(item.unitLabel ? 'unit' : 'g');
    setQuantityModalAmount('');
  };

  const quantityModalAmountNum = parseFloat(quantityModalAmount.replace(',', '.')) || 0;
  const quantityModalAmountG = quantityModalItem && quantityModalUnitMode === 'unit'
    ? quantityModalAmountNum * (quantityModalItem.unitAmount || 0)
    : quantityModalAmountNum;
  const quantityModalKcal = quantityModalItem
    ? Math.round(quantityModalItem.kcalPer100g * (quantityModalAmountG / 100))
    : 0;

  const confirmQuantityModal = () => {
    if (!quantityModalItem || quantityModalAmountNum <= 0 || quantityModalKcal > remaining) return;
    const item = quantityModalItem;

    if (item.isRecipe) {
      const recipe = item.recipe;
      const totalW = recipeTotalWeightG(recipe);
      const ratio = quantityModalAmountG / totalW;
      const newEntries = (!recipe.ingredients?.length)
        ? [{
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: recipe.name,
          emoji: recipe.emoji || '🍽️',
          recipeName: recipe.name,
          amountG: Math.round(quantityModalAmountG),
          kcal: quantityModalKcal,
          mealType: activeMeal,
          addedAt: Date.now(),
        }]
        : recipe.ingredients.map((ing, idx) => ({
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          name: ing.name,
          emoji: recipe.emoji || '🍽️',
          recipeName: recipe.name,
          kcalPer100g: ing.kcalPer100g,
          amountG: Math.round(ing.amountG * ratio),
          kcal: Math.round(ing.kcal * ratio),
          mealType: activeMeal,
          addedAt: Date.now(),
        }));
      const entries = [...day.entries, ...newEntries];
      const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
      setDay(updated);
      saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
      setQuantityModalItem(null);
      setQuantityModalAmount('');
      return;
    }

    const ingredientKey = item.id || item.ingredientKey;
    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ingredientId: ingredientKey,
      name: item.name,
      emoji: item.emoji || '🍽️',
      brand: item.brand || null,
      kcalPer100g: item.kcalPer100g,
      amountG: quantityModalAmountG,
      kcal: quantityModalKcal,
      mealType: activeMeal,
      addedAt: Date.now(),
    };
    const entries = [...day.entries, newEntry];
    const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
    recordUsage(user.uid, ingredientKey, {
      name: item.name,
      emoji: item.emoji || '🍽️',
      kcalPer100g: item.kcalPer100g,
      source: 'shared',
    }).catch((e) => console.warn('No se pudo registrar el uso:', e.message));
    setQuantityModalItem(null);
    setQuantityModalAmount('');
  };

  // Abre el mismo modal de cantidad que usan los ingredientes de la grilla, pero
  // cargado con la tasa kcal/100g del lote completo y prellenado con el peso total
  // (a diferencia de los ingredientes, donde el input arranca vacío a propósito).
  const openRecipeQuantityModal = (recipe) => {
    const totalW = recipeTotalWeightG(recipe);
    const totalKcalRecipe = recipeTotalKcal(recipe);
    setQuantityModalItem({
      isRecipe: true,
      recipe,
      name: recipe.name,
      emoji: recipe.emoji || '🍽️',
      unit: 'g',
      kcalPer100g: totalW ? (totalKcalRecipe / totalW) * 100 : 0,
    });
    setQuantityModalUnitMode('g');
    setQuantityModalAmount(totalW ? String(totalW) : '');
  };

  const addRecipeToMeal = (recipe) => {
    const total = recipeTotalKcal(recipe);
    if (total > remaining) return;

    let newEntries;
    if (recipe.mode === 'simple' || !recipe.ingredients?.length) {
      newEntries = [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: recipe.name,
        emoji: recipe.emoji || '🍽️',
        kcal: total,
        mealType: activeMeal,
        addedAt: Date.now(),
      }];
    } else {
      newEntries = recipe.ingredients.map((ing, idx) => ({
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        name: ing.name,
        emoji: recipe.emoji || '🍽️',
        recipeName: recipe.name,
        kcalPer100g: ing.kcalPer100g,
        amountG: ing.amountG,
        kcal: ing.kcal,
        mealType: activeMeal,
        addedAt: Date.now(),
      }));
    }

    const entries = [...day.entries, ...newEntries];
    const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
  };

  const searchResults = searchText.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(searchText.trim().toLowerCase())).slice(0, 20)
    : [];

  const selectSearchItem = (item) => {
    setSelectedSearchItem(item);
    setSearchUnitMode(item.unitLabel ? 'unit' : 'g');
    setSearchAmount('');
    setSearchText('');
  };

  const searchAmountNum = parseFloat(searchAmount.replace(',', '.')) || 0;
  const searchAmountG = selectedSearchItem && searchUnitMode === 'unit'
    ? searchAmountNum * (selectedSearchItem.unitAmount || 0)
    : searchAmountNum;
  const searchKcal = selectedSearchItem ? Math.round(selectedSearchItem.kcalPer100g * (searchAmountG / 100)) : 0;

  const addSearchItem = () => {
    if (!selectedSearchItem || searchAmountNum <= 0 || searchKcal > remaining) return;
    const ingredientKey = selectedSearchItem.id;
    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ingredientId: ingredientKey,
      name: selectedSearchItem.name,
      emoji: selectedSearchItem.emoji || '🍽️',
      brand: selectedSearchItem.brand || null,
      kcalPer100g: selectedSearchItem.kcalPer100g,
      amountG: searchAmountG,
      kcal: searchKcal,
      mealType: activeMeal,
      addedAt: Date.now(),
    };
    const entries = [...day.entries, newEntry];
    const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
    recordUsage(user.uid, ingredientKey, {
      name: selectedSearchItem.name,
      emoji: selectedSearchItem.emoji || '🍽️',
      kcalPer100g: selectedSearchItem.kcalPer100g,
      source: 'shared',
    }).catch((e) => console.warn('No se pudo registrar el uso:', e.message));
    setSelectedSearchItem(null);
    setSearchAmount('');
    setSearchUnitMode('g');
  };

  const handleRemoveEntry = (entryId) => {
    const entries = day.entries.filter((e) => e.id !== entryId);
    const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
  };

  const canStep = (entry, deltaG) => {
    const newAmount = entry.amountG + deltaG;
    if (newAmount < 10) return false;
    const newKcal = Math.round((entry.kcalPer100g * newAmount) / 100);
    const projected = day.kcalConsumed - entry.kcal + newKcal;
    return projected <= hardCap;
  };

  const stepEntry = (entry, deltaG) => {
    if (!canStep(entry, deltaG)) return;
    const newAmount = entry.amountG + deltaG;
    const newKcal = Math.round((entry.kcalPer100g * newAmount) / 100);
    const entries = day.entries.map((e) =>
      e.id === entry.id ? { ...e, amountG: newAmount, kcal: newKcal } : e
    );
    const updated = { ...day, entries, kcalConsumed: sumKcal(entries) };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
  };

  const cardioPreviewKcal = acsmKcal(
    parseFloat(cardioSpeed.replace(',', '.')) || 0,
    parseFloat(cardioIncline.replace(',', '.')) || 0,
    parseFloat(cardioMinutes.replace(',', '.')) || 0,
    profile.weight
  );

  const setExerciseBoost = (kcal) => {
    const updated = { ...day, exerciseBoostKcal: kcal };
    setDay(updated);
    saveDay(user.uid, today, updated).catch((e) => console.warn('No se pudo guardar:', e.message));
  };

  const applyExercise = () => {
    const kcal = exerciseType === 'cardio' ? cardioPreviewKcal : GYM_FIXED_KCAL;
    setExerciseBoost(kcal);
    setExerciseOpen(false);
  };

  const removeExercise = () => {
    setExerciseBoost(0);
  };

  const performCloseDay = () => {
    const leftover = Math.max(0, hardCap - day.kcalConsumed);
    const bankBefore = profile.bankKcal || 0;
    const kgBefore = Math.floor(bankBefore / KCAL_PER_KG);
    const bankAfter = bankBefore + leftover;
    const kgAfter = Math.floor(bankAfter / KCAL_PER_KG);
    const milestone = leftover > 0 && kgAfter > kgBefore;

    setDayHistory(user.uid, today, {
      kcalConsumed: day.kcalConsumed,
      exerciseBoostKcal: day.exerciseBoostKcal || 0,
      hardCap,
      leftover,
    }).catch((e) => console.warn('No se pudo archivar el historial del día:', e.message));

    const emptyDay = { entries: [], exerciseBoostKcal: 0, kcalConsumed: 0 };
    setDay(emptyDay);
    setProfile((p) => ({ ...p, bankKcal: bankAfter }));
    saveDay(user.uid, today, emptyDay).catch((e) => console.warn('No se pudo guardar:', e.message));
    addToBank(user.uid, leftover).catch((e) => console.warn('No se pudo actualizar el banco:', e.message));
    updateProfileFields(user.uid, { lastOpenDayId: today }).catch((e) => console.warn('No se pudo actualizar el puntero de día:', e.message));

    if (milestone) {
      setCelebration({
        emoji: '🎉',
        title: '¡Enhorabuena!',
        sub: `Ahora podés cambiar tus ahorros por ${kgAfter - kgBefore} kg de peso.\nGuardaste ${leftover} kcal hoy para lograrlo.`,
        intensity: 'high',
      });
    } else if (leftover > 0) {
      setCelebration({
        emoji: '🏆',
        title: '¡Ahorraste monedas hoy!',
        sub: `Guardaste ${leftover} kcal en el banco.\nLlevás ${bankAfter % KCAL_PER_KG} / ${KCAL_PER_KG} kcal hacia tu próximo kg.`,
        intensity: 'medium',
      });
    } else {
      setCelebration({
        emoji: '⚖️',
        title: 'Día cerrado',
        sub: 'Usaste el total de tus monedas de hoy.\nNo se sumó nada al banco esta vez.',
        intensity: 'none',
      });
    }
  };

  const bankKcal = profile.bankKcal || 0;
  const kcalUntilNextKg = bankKcal % KCAL_PER_KG;
  const entriesForMeal = day.entries.filter((e) => e.mealType === activeMeal);
  const mealTotalKcal = entriesForMeal.reduce((s, e) => s + e.kcal, 0);
  const selectCategory = (cat) => {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  };

  // El día pendiente se cierra con el mismo mantenimiento de HOY (no se guardó
  // un mantenimiento histórico por día), igual que ya asume el resto de la app.
  const pendingHardCap = pendingDay ? mantenimiento + (pendingDay.exerciseBoostKcal || 0) : 0;
  const pendingLeftover = pendingDay ? Math.max(0, pendingHardCap - pendingDay.kcalConsumed) : 0;
  const pendingByMeal = pendingDay
    ? MEALS.map((meal) => ({ meal, entries: pendingDay.entries.filter((e) => e.mealType === meal) })).filter((g) => g.entries.length > 0)
    : [];

  const closePendingDay = async () => {
    if (!pendingDay) return;
    setPendingDayClosing(true);
    const bankBefore = profile.bankKcal || 0;
    const bankAfter = bankBefore + pendingLeftover;
    try {
      await setDayHistory(user.uid, pendingDay.id, {
        kcalConsumed: pendingDay.kcalConsumed,
        exerciseBoostKcal: pendingDay.exerciseBoostKcal || 0,
        hardCap: pendingHardCap,
        leftover: pendingLeftover,
      });
      await resetDay(user.uid, pendingDay.id);
      await addToBank(user.uid, pendingLeftover);
      await updateProfileFields(user.uid, { lastOpenDayId: today });
      setProfile((p) => ({ ...p, bankKcal: bankAfter }));
      setPendingDay(null);
    } catch (e) {
      console.warn('No se pudo cerrar el día pendiente:', e.message);
    } finally {
      setPendingDayClosing(false);
    }
  };

  const favoriteItems = favorites.map((f) => ({
    id: f.ingredientKey,
    name: f.name,
    emoji: f.emoji,
    kcalPer100g: f.kcalPer100g,
    brand: null,
  }));
  const categoryItems = activeCategory === 'Favoritos'
    ? favoriteItems
    : ingredients.filter((i) => i.category === activeCategory);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* ---- Título de la página ---- */}
          <View style={[styles.shopTitleRow, styles.shopTitleRowFirst]}>
            <View style={styles.shopTitleLine} />
            <Text style={styles.shopTitleText}>Mercado de calorías</Text>
            <View style={styles.shopTitleLine} />
          </View>

          {/* ---- Bolsa de monedas + botón de guardar en el banco ---- */}
          <View style={styles.topRow}>
            <View style={[styles.pouchBar, boosted && styles.pouchBarBoosted, styles.pouchBarInRow]}>
              <View style={styles.pouchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pouchLabel}>MONEDAS DE HOY</Text>
                  <Text style={[styles.pouchCount, boosted && styles.pouchCountBoosted]}>
                    {remaining.toLocaleString('es-AR')}{' '}
                    <Text style={styles.pouchMax}>/ {hardCap.toLocaleString('es-AR')}</Text>
                  </Text>
                </View>
                <Pressable style={({ pressed }) => [styles.exerciseFab, pressed && styles.pressedFeedback]} onPress={() => setExerciseOpen(true)}>
                  <Text style={styles.exerciseFabIcon}>⚡</Text>
                  {boosted && (
                    <View style={styles.exerciseFabBadge}>
                      <Text style={styles.exerciseFabBadgeText}>+{day.exerciseBoostKcal}</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.pouchTrack}>
                <View
                  style={[
                    styles.pouchFill,
                    { width: `${fillPct}%`, backgroundColor: inAmberZone ? colors.gold : colors.availableGreen },
                  ]}
                />
                <View style={[styles.deficitMarker, { left: `${markerLeftPct}%` }]} />
              </View>

              {boosted && <Text style={styles.boostBanner}>⚡ ¡Hoy tenés más monedas!</Text>}

              <Text style={styles.bankInlineText}>
                🏦{' '}
                <Text style={styles.kcalHighlight}>
                  {kcalUntilNextKg.toLocaleString('es-AR')} / 7700
                </Text>
                {' '} kcal para tu próximo kg
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.saveBankSquare, pressed && styles.pressedFeedback]}
              onPress={() => setConfirmCloseOpen(true)}
            >
              <Text style={styles.saveBankSquareIcon}>🏦</Text>
              <Text style={styles.saveBankSquareTitle}>Guardar en el Banco</Text>
            </Pressable>
          </View>

          {/* ---- Separador antes del pedido, como en el mockup ---- */}
          <View style={styles.shopTitleRow}>
            <View style={styles.shopTitleLine} />
            <Text style={styles.shopTitleText}>Acá va tu compra</Text>
            <View style={styles.shopTitleLine} />
          </View>

          {/* ---- Comida: tabs + pedido, como una sola tarjeta ---- */}
          <View style={styles.orderCard}>
            <View style={styles.mealTabs}>
              {MEALS.map((meal) => (
                <Pressable
                  key={meal}
                  style={({ pressed }) => [styles.mealTab, activeMeal === meal && styles.mealTabActive, pressed && styles.pressedFeedback]}
                  onPress={() => setActiveMeal(meal)}
                >
                  <Text style={[styles.mealTabText, activeMeal === meal && styles.mealTabTextActive]}>
                    {meal}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={styles.orderScrollFixed} nestedScrollEnabled showsVerticalScrollIndicator>
              {entriesForMeal.length === 0 ? (
                <View style={styles.orderEmpty}>
                  <Text style={styles.orderEmptyText}>Acá va tu pedido — todavía no agregaste nada.</Text>
                </View>
              ) : (
                <>
                  {entriesForMeal.map((entry) => (
                    <View key={entry.id} style={styles.orderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orderName}>
                          {entry.emoji || '🍽️'} {entry.name}
                          {entry.brand ? ` · ${entry.brand}` : ''}
                          {entry.recipeName ? ` · ${entry.recipeName}` : ''}
                        </Text>
                        {entry.kcalPer100g != null && (
                          <View style={styles.orderGramsRow}>
                            <Pressable
                              style={({ pressed }) => [styles.miniBtn, !canStep(entry, -10) && styles.miniBtnDisabled, pressed && styles.pressedFeedback]}
                              onPress={() => stepEntry(entry, -10)}
                              disabled={!canStep(entry, -10)}
                            >
                              <Text style={styles.miniBtnText}>−</Text>
                            </Pressable>
                            <Text style={styles.orderGrams}>{entry.amountG}g</Text>
                            <Pressable
                              style={({ pressed }) => [styles.miniBtn, !canStep(entry, 10) && styles.miniBtnDisabled, pressed && styles.pressedFeedback]}
                              onPress={() => stepEntry(entry, 10)}
                              disabled={!canStep(entry, 10)}
                            >
                              <Text style={styles.miniBtnText}>+</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                      <View style={styles.orderKcalWrap}>
                        <Text style={styles.orderKcalBig}>{entry.kcal} kcal</Text>
                      </View>
                      <Pressable style={styles.orderRemove} onPress={() => handleRemoveEntry(entry.id)}>
                        <Text style={styles.orderRemoveText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                  <View style={styles.orderTotalRow}>
                    <Text style={styles.orderTotalLabel}>Total</Text>
                    <View style={styles.orderKcalWrap}>
                      <Text style={styles.orderKcalBig}>{mealTotalKcal} kcal</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>

          {/* ---- Separador entre el pedido y los ingredientes, como en el mockup ---- */}
          <View style={styles.shopTitleRow}>
            <View style={styles.shopTitleLine} />
            <Text style={styles.shopTitleText}>{activeMeal}</Text>
            <View style={styles.shopTitleLine} />
          </View>

          {/* ---- Ingredientes / Recetas / Buscar ---- */}
          <View style={styles.ingredientsCard}>
            <View style={styles.subTabs}>
              <Pressable
                style={({ pressed }) => [styles.subTab, activeSubTab === 'sugeridos' && styles.subTabActive, pressed && styles.pressedFeedback]}
                onPress={() => setActiveSubTab('sugeridos')}
              >
                <Text style={[styles.subTabText, activeSubTab === 'sugeridos' && styles.subTabTextActive]}>Ingredientes</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.subTab, activeSubTab === 'guardadas' && styles.subTabActive, pressed && styles.pressedFeedback]}
                onPress={() => setActiveSubTab('guardadas')}
              >
                <Text style={[styles.subTabText, activeSubTab === 'guardadas' && styles.subTabTextActive]}>Recetas</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.subTab, activeSubTab === 'buscar' && styles.subTabActive, pressed && styles.pressedFeedback]}
                onPress={() => setActiveSubTab('buscar')}
              >
                <Text style={[styles.subTabText, activeSubTab === 'buscar' && styles.subTabTextActive]}>Buscar</Text>
              </Pressable>
            </View>

            {activeSubTab === null && (
              <View style={styles.ingredientsEmpty}>
                <Text style={styles.ingredientsEmptyText}>Elegí una opción para agregar algo a esta comida</Text>
              </View>
            )}

            {activeSubTab === 'sugeridos' && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                  {favorites.length > 0 && (
                    <Pressable
                      style={({ pressed }) => [styles.categoryChip, activeCategory === 'Favoritos' && styles.categoryChipActive, pressed && styles.pressedFeedback]}
                      onPress={() => selectCategory('Favoritos')}
                    >
                      <Text style={[styles.categoryChipText, activeCategory === 'Favoritos' && styles.categoryChipTextActive]}>
                        Favoritos
                      </Text>
                    </Pressable>
                  )}
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={({ pressed }) => [styles.categoryChip, activeCategory === cat && styles.categoryChipActive, pressed && styles.pressedFeedback]}
                      onPress={() => selectCategory(cat)}
                    >
                      <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {activeCategory === null ? (
                  <View style={styles.ingredientsEmpty}>
                    <Text style={styles.ingredientsEmptyText}>Elegí una categoría para ver los ingredientes</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.gridScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                    <View style={styles.grid}>
                      {categoryItems.map((item) => {
                        const { pctCovered, affordText, tight } = affordInfo(item, remaining);
                        const blocked = remaining <= 0;
                        return (
                          <Pressable
                            key={item.id}
                            style={({ pressed }) => [styles.item, pressed && !blocked && styles.pressedFeedback]}
                            onPress={() => openQuantityModal(item)}
                            disabled={blocked}
                          >
                            <View>
                              <Text style={styles.itemEmoji}>{item.emoji || '🍽️'}</Text>
                              <Text style={styles.itemName}>{item.name}</Text>
                              {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
                              <Text style={styles.itemPrice}>● {Math.round(item.kcalPer100g)} kcal / 100{item.unit === 'ml' ? 'ml' : 'g'}</Text>
                              {!!affordText && (
                                <Text style={[styles.itemAfford, tight && styles.itemAffordTight]}>{affordText}</Text>
                              )}
                            </View>
                            {pctCovered > 0 && (
                              <View style={[styles.itemFade, { height: `${pctCovered}%` }]}>
                                <Text style={[styles.itemEmoji, styles.itemFadeText]}>{item.emoji || '🍽️'}</Text>
                                <Text style={[styles.itemName, styles.itemFadeText]}>{item.name}</Text>
                                <Text style={[styles.itemPrice, styles.itemFadeText]}>● {Math.round(item.kcalPer100g)} kcal / 100{item.unit === 'ml' ? 'ml' : 'g'}</Text>
                              </View>
                            )}
                            {blocked && (
                              <View style={styles.lockedOverlay}>
                                <Text style={styles.lockedOverlayText}>SIN MONEDAS</Text>
                                <Text style={styles.lockedOverlayText}>PARA ESTO</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </>
            )}

            {activeSubTab === 'guardadas' && (
              recipes.length === 0 ? (
                <View style={styles.orderEmpty}>
                  <Text style={styles.orderEmptyText}>Todavía no guardaste ninguna receta. Andá a la pestaña Recetas para crear la primera.</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {recipes.map((recipe) => {
                    const total = recipeTotalKcal(recipe);
                    const locked = total > remaining;
                    const canPortion = recipe.scalable && !!recipeTotalWeightG(recipe);
                    return (
                      <Pressable
                        key={recipe.id}
                        style={({ pressed }) => [styles.item, locked && styles.itemLocked, pressed && styles.pressedFeedback]}
                        onPress={() => (canPortion && !locked ? openRecipeQuantityModal(recipe) : addRecipeToMeal(recipe))}
                        disabled={locked}
                      >
                        <Text style={[styles.itemEmoji, locked && styles.itemTextLocked]}>{recipe.emoji || '🍽️'}</Text>
                        <Text style={[styles.itemName, locked && styles.itemTextLocked]}>{recipe.name}</Text>
                        <Text style={[styles.itemGrams, locked && styles.itemTextLocked]}>
                          {recipe.scalable
                            ? (recipeTotalWeightG(recipe) ? `${recipeTotalWeightG(recipe)} g totales` : 'Preparación grande')
                            : (recipe.mode === 'simple' ? 'Total manual' : `${recipe.ingredients?.length || 0} ingredientes`)}
                        </Text>
                        <Text style={[styles.itemPrice, locked && styles.itemPriceLocked]}>● {total} kcal</Text>
                        {locked && (
                          <View style={styles.lockedOverlay}>
                            <Text style={styles.lockedOverlayText}>NO ALCANZA</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )
            )}

            {activeSubTab === 'buscar' && (
              <View>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Ej: arroz, aceite, banana..."
                    placeholderTextColor={colors.muted}
                    value={searchText}
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                    onChangeText={(t) => {
                      setSearchText(t);
                      setSelectedSearchItem(null);
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                    }}
                  />
                </View>

                {searchText.trim().length > 0 && searchResults.length === 0 && (
                  <Text style={styles.searchEmptyText}>No se encontraron ingredientes.</Text>
                )}

                {searchResults.map((item) => (
                  <Pressable key={item.id} style={styles.searchResultRow} onPress={() => selectSearchItem(item)}>
                    <Text style={styles.searchResultName}>
                      {item.emoji || '🍽️'} {item.name}{item.brand ? ` · ${item.brand}` : ''}
                    </Text>
                    <Text style={styles.searchResultKcal}>
                      {item.unitLabel
                        ? `1 ${item.unitLabel} · ${Math.round((item.kcalPer100g * item.unitAmount) / 100)} kcal`
                        : `${Math.round(item.kcalPer100g)} kcal/100g`}
                    </Text>
                  </Pressable>
                ))}

                {selectedSearchItem && (
                  <View style={styles.quantityPanel}>
                    <Text style={styles.quantityPanelName}>
                      {selectedSearchItem.emoji || '🍽️'} {selectedSearchItem.name}
                    </Text>
                    {selectedSearchItem.unitLabel && (
                      <View style={styles.exerciseTypeTabs}>
                        <Pressable
                          style={[styles.exerciseTypeTab, searchUnitMode === 'unit' && styles.exerciseTypeTabActive]}
                          onPress={() => { setSearchUnitMode('unit'); setSearchAmount(''); }}
                        >
                          <Text style={[styles.exerciseTypeTabText, searchUnitMode === 'unit' && styles.exerciseTypeTabTextActive]}>
                            {selectedSearchItem.unitLabel.charAt(0).toUpperCase() + selectedSearchItem.unitLabel.slice(1)}s
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.exerciseTypeTab, searchUnitMode === 'g' && styles.exerciseTypeTabActive]}
                          onPress={() => { setSearchUnitMode('g'); setSearchAmount(''); }}
                        >
                          <Text style={[styles.exerciseTypeTabText, searchUnitMode === 'g' && styles.exerciseTypeTabTextActive]}>
                            Gramos
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    <View style={styles.quantityPanelRow}>
                      <TextInput
                        style={styles.quantityPanelInput}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                        value={searchAmount}
                        onChangeText={setSearchAmount}
                        autoFocus
                      />
                      <Text style={styles.quantityPanelUnit}>
                        {searchUnitMode === 'unit' ? selectedSearchItem.unitLabel : 'gramos'}
                      </Text>
                      <Text style={styles.quantityPanelKcal}>{searchKcal} kcal</Text>
                    </View>
                    {searchUnitMode === 'unit' && searchAmountNum > 0 && (
                      <Text style={styles.exerciseSourceNote}>≈ {Math.round(searchAmountG)} g en total</Text>
                    )}
                    {searchAmountNum > 0 && searchKcal > remaining && (
                      <Text style={styles.quantityPanelWarning}>No alcanza con tus monedas restantes.</Text>
                    )}
                    <Pressable
                      style={({ pressed }) => [
                        styles.qpAddBtn,
                        (searchAmountNum <= 0 || searchKcal > remaining) && styles.qpAddBtnDisabled,
                        pressed && styles.pressedFeedback,
                      ]}
                      onPress={addSearchItem}
                      disabled={searchAmountNum <= 0 || searchKcal > remaining}
                    >
                      <Text style={styles.qpAddBtnText}>Agregar</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ---- Cantidad al elegir un ingrediente de la grilla ---- */}
      <Modal visible={!!quantityModalItem} transparent animationType="fade" onRequestClose={() => setQuantityModalItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.quantityPanelName}>
              {quantityModalItem?.emoji || '🍽️'} {quantityModalItem?.name}
            </Text>
            {quantityModalItem?.unitLabel && (
              <View style={styles.exerciseTypeTabs}>
                <Pressable
                  style={[styles.exerciseTypeTab, quantityModalUnitMode === 'unit' && styles.exerciseTypeTabActive]}
                  onPress={() => { setQuantityModalUnitMode('unit'); setQuantityModalAmount(''); }}
                >
                  <Text style={[styles.exerciseTypeTabText, quantityModalUnitMode === 'unit' && styles.exerciseTypeTabTextActive]}>
                    {quantityModalItem.unitLabel.charAt(0).toUpperCase() + quantityModalItem.unitLabel.slice(1)}s
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.exerciseTypeTab, quantityModalUnitMode === 'g' && styles.exerciseTypeTabActive]}
                  onPress={() => { setQuantityModalUnitMode('g'); setQuantityModalAmount(''); }}
                >
                  <Text style={[styles.exerciseTypeTabText, quantityModalUnitMode === 'g' && styles.exerciseTypeTabTextActive]}>
                    Gramos
                  </Text>
                </Pressable>
              </View>
            )}
            <View style={styles.quantityPanelRow}>
              <TextInput
                style={styles.quantityPanelInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.muted}
                value={quantityModalAmount}
                onChangeText={setQuantityModalAmount}
                autoFocus
              />
              <Text style={styles.quantityPanelUnit}>
                {quantityModalUnitMode === 'unit' ? quantityModalItem?.unitLabel : (quantityModalItem?.unit === 'ml' ? 'mililitros' : 'gramos')}
              </Text>
              <Text style={styles.quantityPanelKcal}>{quantityModalKcal} kcal</Text>
            </View>
            {quantityModalUnitMode === 'unit' && quantityModalAmountNum > 0 && (
              <Text style={styles.exerciseSourceNote}>≈ {Math.round(quantityModalAmountG)} g en total</Text>
            )}
            {quantityModalAmountNum > 0 && quantityModalKcal > remaining && (
              <Text style={styles.quantityPanelWarning}>No alcanza con tus monedas restantes.</Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.qpAddBtn,
                (quantityModalAmountNum <= 0 || quantityModalKcal > remaining) && styles.qpAddBtnDisabled,
                pressed && styles.pressedFeedback,
              ]}
              onPress={confirmQuantityModal}
              disabled={quantityModalAmountNum <= 0 || quantityModalKcal > remaining}
            >
              <Text style={styles.qpAddBtnText}>Agregar</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setQuantityModalItem(null)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ---- Aviso de día anterior sin cerrar ---- */}
      <Modal visible={!!pendingDay} transparent animationType="fade" onRequestClose={() => { }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.confirmTitle}>Tu día del {pendingDay?.id} quedó sin cerrar</Text>
            <Text style={styles.confirmBody}>
              Abriste la app en un día nuevo sin cerrar el anterior, así que esas calorías todavía no se guardaron en el banco. Revisá qué habías cargado y cerralo cuando quieras.
            </Text>

            <ScrollView style={styles.pendingDayScroll} nestedScrollEnabled>
              {pendingByMeal.length === 0 ? (
                <Text style={styles.orderEmptyText}>Solo tenías actividad física cargada ese día, sin comidas.</Text>
              ) : (
                pendingByMeal.map(({ meal, entries }) => (
                  <View key={meal} style={{ marginBottom: 10 }}>
                    <Text style={styles.pendingMealTitle}>{meal.toUpperCase()}</Text>
                    {entries.map((e) => (
                      <View key={e.id} style={styles.pendingEntryRow}>
                        <Text style={styles.pendingEntryName} numberOfLines={1}>{e.emoji || '🍽️'} {e.name}</Text>
                        <Text style={styles.pendingEntryKcal}>{e.kcal} kcal</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.closeWeightBox}>
              <Text style={styles.confirmBody}>
                Total consumido: <Text style={styles.remaining}>{pendingDay?.kcalConsumed || 0} kcal</Text>
                {'\n'}Se van a guardar <Text style={styles.remaining}>{pendingLeftover} kcal</Text> en el banco.
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmAcceptBtn, { width: '100%' }, pressed && styles.pressedFeedback]}
                onPress={closePendingDay}
                disabled={pendingDayClosing}
              >
                {pendingDayClosing ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.confirmAcceptText}>Cerrar y guardar {pendingLeftover} kcal</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Confirmación antes de cerrar el día ---- */}
      <Modal visible={confirmCloseOpen} transparent animationType="fade" onRequestClose={() => setConfirmCloseOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.confirmTitle}>¿Cerrar el día de hoy?</Text>
            <Text style={styles.confirmBody}>
              {remaining > 0 ? (
                <>
                  Vas a guardar{' '}
                  <Text style={styles.remaining}>{remaining} kcal</Text>
                  {' '}sobrantes de hoy y arrancar mañana desde cero. Tus comidas cargadas hoy se van a borrar de la pantalla.
                </>
              ) : (
                'No sobró nada para guardar hoy, pero igual se cierra el día y arrancás mañana desde cero.'
              )}
            </Text>

            <View style={styles.closeWeightBox}>
              <Text style={styles.closeWeightLabel}>¿Ya te pesaste hoy? (opcional)</Text>
              <View style={styles.closeWeightRow}>
                <TextInput
                  style={styles.closeWeightInput}
                  keyboardType="decimal-pad"
                  placeholder={profile.weight ? String(profile.weight) : '0.0'}
                  placeholderTextColor={colors.muted}
                  value={closeWeightInput}
                  onChangeText={setCloseWeightInput}
                />
                <Text style={styles.closeWeightUnit}>kg</Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmCancelBtn} onPress={() => setConfirmCloseOpen(false)}>
                <Text style={styles.confirmCancelText}>Seguir cargando</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmAcceptBtn, pressed && styles.pressedFeedback]}
                onPress={() => {
                  const w = parseFloat(closeWeightInput.replace(',', '.'));
                  if (!isNaN(w) && w > 0) {
                    setWeightLog(user.uid, todayId(), w).catch((e) => console.warn('No se pudo guardar el peso:', e.message));
                    setProfile((p) => ({ ...p, weight: w }));
                  }
                  setCloseWeightInput('');
                  setConfirmCloseOpen(false);
                  performCloseDay();
                }}
              >
                <Text style={styles.confirmAcceptText}>Sí, guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Modal de ejercicio ---- */}
      <Modal visible={exerciseOpen} transparent animationType="fade" onRequestClose={() => setExerciseOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.exerciseModalCard]}>
            <Text style={styles.exerciseModalTitle}>Actividad física de hoy</Text>

            <View style={styles.exerciseTypeTabs}>
              <Pressable
                style={[styles.exerciseTypeTab, exerciseType === 'cardio' && styles.exerciseTypeTabActive]}
                onPress={() => setExerciseType('cardio')}
              >
                <Text style={[styles.exerciseTypeTabText, exerciseType === 'cardio' && styles.exerciseTypeTabTextActive]}>
                  Caminata / Trote
                </Text>
              </Pressable>
              <Pressable
                style={[styles.exerciseTypeTab, exerciseType === 'gym' && styles.exerciseTypeTabActive]}
                onPress={() => setExerciseType('gym')}
              >
                <Text style={[styles.exerciseTypeTabText, exerciseType === 'gym' && styles.exerciseTypeTabTextActive]}>
                  Gimnasio
                </Text>
              </Pressable>
            </View>

            {exerciseType === 'cardio' ? (
              <>
                <View style={styles.exerciseFieldRow}>
                  <Text style={styles.exerciseFieldLabel}>Velocidad</Text>
                  <View style={styles.exerciseFieldControl}>
                    <TextInput
                      style={styles.exerciseFieldInput}
                      keyboardType="decimal-pad"
                      value={cardioSpeed}
                      onChangeText={setCardioSpeed}
                    />
                    <Text style={styles.exerciseFieldUnit}>km/h</Text>
                  </View>
                </View>
                <View style={styles.exerciseFieldRow}>
                  <Text style={styles.exerciseFieldLabel}>Pendiente</Text>
                  <View style={styles.exerciseFieldControl}>
                    <TextInput
                      style={styles.exerciseFieldInput}
                      keyboardType="decimal-pad"
                      value={cardioIncline}
                      onChangeText={setCardioIncline}
                    />
                    <Text style={styles.exerciseFieldUnit}>%</Text>
                  </View>
                </View>
                <View style={styles.exerciseFieldRow}>
                  <Text style={styles.exerciseFieldLabel}>Duración</Text>
                  <View style={styles.exerciseFieldControl}>
                    <TextInput
                      style={styles.exerciseFieldInput}
                      keyboardType="decimal-pad"
                      value={cardioMinutes}
                      onChangeText={setCardioMinutes}
                    />
                    <Text style={styles.exerciseFieldUnit}>min</Text>
                  </View>
                </View>
                <Text style={styles.exerciseKcalPreview}>
                  {cardioPreviewKcal > 0 ? `+${cardioPreviewKcal} kcal` : '0 kcal'}
                </Text>
                <Text style={styles.exerciseSourceNote}>Ecuación metabólica ACSM (caminata/carrera)</Text>
              </>
            ) : (
              <>
                <Text style={styles.exerciseKcalPreview}>+{GYM_FIXED_KCAL} kcal</Text>
                <Text style={styles.exerciseSourceNote}>Monto fijo por sesión de musculación</Text>
              </>
            )}

            <Pressable
              style={({ pressed }) => [styles.modalAddBtn, pressed && styles.pressedFeedback]}
              onPress={applyExercise}
            >
              <Text style={styles.modalAddBtnText}>Aplicar</Text>
            </Pressable>

            {boosted && (
              <Pressable style={styles.exerciseRemoveBtn} onPress={removeExercise}>
                <Text style={styles.exerciseRemoveBtnText}>Quitar actividad física</Text>
              </Pressable>
            )}

            <Pressable style={styles.modalCancel} onPress={() => setExerciseOpen(false)}>
              <Text style={styles.modalCancelText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ---- Celebración al cerrar el día ---- */}
      <Modal
        visible={!!celebration}
        transparent
        animationType="fade"
        onShow={handleCelebrationShow}
        onRequestClose={closeCelebration}
      >
        <View style={styles.modalOverlay}>
          {confettiReady && celebration && celebration.intensity !== 'none' && (
            <ConfettiCannon
              key={celebration.title}
              count={celebration.intensity === 'high' ? 150 : 60}
              origin={{ x: 170, y: 0 }}
              fadeOut
              fallSpeed={2000}
              explosionSpeed={300}
            />
          )}

          <Animated.View style={[styles.modalCard, styles.modalCardOnTop, { transform: [{ scale: celebrationScale }] }]}>
            <Text style={styles.celebrateEmoji}>{celebration?.emoji}</Text>
            <Text style={styles.celebrateTitle}>{celebration?.title}</Text>
            <Text style={styles.celebrateSub}>{celebration?.sub}</Text>
            <Pressable style={({ pressed }) => [styles.modalAddBtn, pressed && styles.pressedFeedback]} onPress={closeCelebration}>
              <Text style={styles.modalAddBtnText}>Listo</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}