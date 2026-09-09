import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import {
  getAllRecipes,
  addRecipe,
  updateRecipe,
  deleteRecipe,
} from '../storage/recipes';
import {
  getAllMyIngredients,
  addMyIngredient,
  updateMyIngredient,
  deleteMyIngredient,
} from '../storage/myIngredients';
import { getAllSharedIngredients } from '../storage/sharedIngredients';
import { CATEGORIES } from '../data/curatedIngredients';
import { colors } from '../theme/colors';


function sumKcal(ingredients) {
  return ingredients.reduce((s, i) => s + i.kcal, 0);
}

export default function RecetasScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('recipes'); // 'recipes' | 'ingredients'
  const [recipes, setRecipes] = useState([]);
  const [myIngredients, setMyIngredients] = useState([]);
  const [sharedIngredients, setSharedIngredients] = useState([]);

  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState(null);

  const [ingredientEditorOpen, setIngredientEditorOpen] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [r, mi, si] = await Promise.all([
      getAllRecipes(user.uid),
      getAllMyIngredients(user.uid),
      getAllSharedIngredients(),
    ]);
    setRecipes(r);
    setMyIngredients(mi);
    setSharedIngredients(si);
    setLoading(false);
  }, [user.uid]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const openNewRecipe = () => {
    setEditingRecipeId(null);
    setRecipeEditorOpen(true);
  };
  const openEditRecipe = (id) => {
    setEditingRecipeId(id);
    setRecipeEditorOpen(true);
  };

  const openNewIngredient = () => {
    setEditingIngredientId(null);
    setIngredientEditorOpen(true);
  };
  const openEditIngredient = (id) => {
    setEditingIngredientId(id);
    setIngredientEditorOpen(true);
  };

  const handleDeleteRecipe = async (id) => {
    setRecipes((rs) => rs.filter((r) => r.id !== id));
    await deleteRecipe(user.uid, id).catch((e) => console.warn(e.message));
  };

  const handleDeleteIngredient = async (id) => {
    setMyIngredients((is) => is.filter((i) => i.id !== id));
    await deleteMyIngredient(user.uid, id).catch((e) => console.warn(e.message));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const editingRecipe = editingRecipeId ? recipes.find((r) => r.id === editingRecipeId) : null;
  const editingIngredient = editingIngredientId ? myIngredients.find((i) => i.id === editingIngredientId) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.frame}>
        <Text style={styles.pageTitle}>Recetas</Text>
        <Text style={styles.pageSub}>Tus comidas guardadas para agregar de una en Mercader</Text>

        <View style={styles.sectionTabs}>
          <Pressable
            style={[styles.sectionTab, activeSection === 'recipes' && styles.sectionTabActive]}
            onPress={() => setActiveSection('recipes')}
          >
            <Text style={[styles.sectionTabText, activeSection === 'recipes' && styles.sectionTabTextActive]}>
              📖  Recetas
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sectionTab, activeSection === 'ingredients' && styles.sectionTabActive]}
            onPress={() => setActiveSection('ingredients')}
          >
            <Text style={[styles.sectionTabText, activeSection === 'ingredients' && styles.sectionTabTextActive]}>
              🧾  Mis ingredientes
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.listContent}>
          {activeSection === 'recipes' ? (
            recipes.length === 0 ? (
              <View style={styles.emptyList}>
                <Text style={styles.emptyListIcon}>📖</Text>
                <Text style={styles.emptyListTitle}>Sin recetas todavía</Text>
                <Text style={styles.emptyListText}>Guardá tus platos armados para agregarlos de un toque desde Mercader.</Text>
              </View>
            ) : (
              recipes.map((r) => (
                <Pressable key={r.id} style={({ pressed }) => [styles.card, pressed && styles.pressedFeedback]} onPress={() => openEditRecipe(r.id)}>
                  <View style={styles.cardEmojiBadge}>
                    <Text style={styles.cardEmoji}>{r.emoji || '🍽️'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.cardMeta}>
                      {r.mode === 'simple' ? 'Total manual' : `${r.ingredients?.length || 0} ingredientes`}
                    </Text>
                  </View>
                  <View style={styles.kcalPill}>
                    <Text style={styles.kcalPillText}>
                      {(r.mode === 'simple' ? r.totalKcal : sumKcal(r.ingredients || [])).toLocaleString('es-AR')}
                    </Text>
                    <Text style={styles.kcalPillUnit}>kcal</Text>
                  </View>
                  <Pressable hitSlop={8} style={styles.cardDelete} onPress={() => handleDeleteRecipe(r.id)}>
                    <Text style={styles.cardDeleteText}>✕</Text>
                  </Pressable>
                </Pressable>
              ))
            )
          ) : myIngredients.length === 0 ? (
            <View style={styles.emptyList}>
              <Text style={styles.emptyListIcon}>🧾</Text>
              <Text style={styles.emptyListTitle}>Sin ingredientes propios</Text>
              <Text style={styles.emptyListText}>Cargá productos puntuales que no estén en la base, con su marca si querés.</Text>
            </View>
          ) : (
            myIngredients.map((ing) => (
              <Pressable key={ing.id} style={({ pressed }) => [styles.card, pressed && styles.pressedFeedback]} onPress={() => openEditIngredient(ing.id)}>
                <View style={styles.cardEmojiBadge}>
                  <Text style={styles.cardEmoji}>🧾</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {ing.name}
                    {ing.brand ? <Text style={styles.cardNameBrand}> · {ing.brand}</Text> : null}
                  </Text>
                  <Text style={styles.cardMeta}>{ing.kind === 'variable' ? 'Por cantidad' : 'Cantidad fija'}</Text>
                </View>
                <View style={styles.kcalPill}>
                  <Text style={styles.kcalPillText}>
                    {ing.kind === 'variable' ? ing.kcalPer100 : ing.kcalTotal}
                  </Text>
                  <Text style={styles.kcalPillUnit}>
                    {ing.kind === 'variable' ? `/100${ing.unit || 'g'}` : 'kcal'}
                  </Text>
                </View>
                <Pressable hitSlop={8} style={styles.cardDelete} onPress={() => handleDeleteIngredient(ing.id)}>
                  <Text style={styles.cardDeleteText}>✕</Text>
                </Pressable>
              </Pressable>
            ))
          )}
        </ScrollView>

        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.pressedFeedback]}
          onPress={activeSection === 'recipes' ? openNewRecipe : openNewIngredient}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </View>

      <RecipeEditor
        visible={recipeEditorOpen}
        onClose={() => setRecipeEditorOpen(false)}
        recipe={editingRecipe}
        sharedIngredients={sharedIngredients}
        myIngredients={myIngredients}
        onSaved={loadAll}
        uid={user.uid}
      />

      <IngredientEditor
        visible={ingredientEditorOpen}
        onClose={() => setIngredientEditorOpen(false)}
        ingredient={editingIngredient}
        onSaved={loadAll}
        uid={user.uid}
      />
    </SafeAreaView>
  );
}

/* ============================================================
   Editor de receta
   ============================================================ */
function RecipeEditor({ visible, onClose, recipe, sharedIngredients, myIngredients, onSaved, uid }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('detailed'); // 'detailed' | 'simple'
  const [ingredients, setIngredients] = useState([]);
  const [manualKcal, setManualKcal] = useState('0');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetFrom = useCallback(() => {
    if (recipe) {
      setName(recipe.name);
      setMode(recipe.mode);
      setIngredients(recipe.ingredients || []);
      setManualKcal(String(recipe.totalKcal || 0));
    } else {
      setName('');
      setMode('detailed');
      setIngredients([]);
      setManualKcal('0');
    }
    setSearchText('');
    setActiveCategory(CATEGORIES[0]);
  }, [recipe]);

  const allPickableIngredients = [
    ...myIngredients
      .filter((i) => i.kind === 'variable')
      .map((i) => ({ id: i.id, name: i.name, brand: i.brand, emoji: '🧾', kcalPer100g: i.kcalPer100, category: i.category || 'Otros' })),
    ...sharedIngredients,
  ];

  const searchResults = searchText.trim()
    ? allPickableIngredients.filter((i) => i.name.toLowerCase().includes(searchText.trim().toLowerCase()))
    : [];

  const categoryTabs = CATEGORIES;
  const categoryItems = allPickableIngredients.filter((i) => i.category === activeCategory);

  const quickAddIngredient = (item) => {
    const kcal = Math.round(item.kcalPer100g);
    setIngredients((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.name,
        kcalPer100g: item.kcalPer100g,
        amountG: 100,
        kcal,
      },
    ]);
    setSearchText('');
  };

  const removeIngredient = (id) => setIngredients((prev) => prev.filter((i) => i.id !== id));

  const stepIngredient = (id, deltaG) => {
    setIngredients((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const newAmount = Math.max(10, i.amountG + deltaG);
        return { ...i, amountG: newAmount, kcal: Math.round((i.kcalPer100g * newAmount) / 100) };
      })
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (mode === 'detailed' && ingredients.length === 0) return;
    if (mode === 'simple' && (parseInt(manualKcal, 10) || 0) <= 0) return;

    setSaving(true);
    const data = {
      name: name.trim(),
      emoji: '🍽️',
      mode,
      ingredients: mode === 'detailed' ? ingredients : [],
      totalKcal: mode === 'simple' ? parseInt(manualKcal, 10) || 0 : sumKcal(ingredients),
    };
    try {
      if (recipe) {
        await updateRecipe(uid, recipe.id, data);
      } else {
        await addRecipe(uid, data);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.warn('No se pudo guardar la receta:', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!recipe) return;
    await deleteRecipe(uid, recipe.id).catch((e) => console.warn(e.message));
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onShow={resetFrom} onRequestClose={onClose}>
      <SafeAreaView style={styles.editorSafeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          <View style={styles.editorHeader}>
            <Pressable style={styles.editorClose} onPress={onClose}>
              <Text style={styles.editorCloseText}>✕</Text>
            </Pressable>
            <Text style={styles.editorTitle}>{recipe ? 'Editar receta' : 'Nueva receta'}</Text>
          </View>

          <TextInput
            style={styles.nameInput}
            placeholder="Nombre del plato, ej. Milanesa con puré"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />

          {/* ---- Tarjeta 1: modo + lo que ya cargaste ---- */}
          <View style={styles.recipeCard}>
            <View style={styles.modeTabs}>
              <Pressable style={[styles.modeTab, mode === 'detailed' && styles.modeTabActive]} onPress={() => setMode('detailed')}>
                <Text style={[styles.modeTabText, mode === 'detailed' && styles.modeTabTextActive]}>Con ingredientes</Text>
              </Pressable>
              <Pressable style={[styles.modeTab, mode === 'simple' && styles.modeTabActive]} onPress={() => setMode('simple')}>
                <Text style={[styles.modeTabText, mode === 'simple' && styles.modeTabTextActive]}>Solo el total</Text>
              </Pressable>
            </View>

            {mode === 'detailed' ? (
              <View style={styles.orderPanel}>
                <View style={styles.orderPanelHeader}>
                  <Text style={styles.orderPanelTitle}>INGREDIENTES AGREGADOS</Text>
                  <Text style={styles.orderPanelCount}>{ingredients.length} items</Text>
                </View>
                {ingredients.length === 0 ? (
                  <Text style={styles.orderEmptyText}>Todavía no agregaste ningún ingrediente.</Text>
                ) : (
                  ingredients.map((ing) => (
                    <View key={ing.id} style={styles.orderRow}>
                      <Text style={styles.orderRowName} numberOfLines={1}>{ing.name}</Text>
                      <Pressable style={styles.miniBtn} onPress={() => stepIngredient(ing.id, -10)}>
                        <Text style={styles.miniBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.orderRowGrams}>{ing.amountG}g</Text>
                      <Pressable style={styles.miniBtn} onPress={() => stepIngredient(ing.id, 10)}>
                        <Text style={styles.miniBtnText}>+</Text>
                      </Pressable>
                      <Text style={styles.orderRowKcal}>{ing.kcal} kcal</Text>
                      <Pressable style={styles.orderRemove} onPress={() => removeIngredient(ing.id)}>
                        <Text style={styles.orderRemoveText}>✕</Text>
                      </Pressable>
                    </View>
                  ))
                )}
                <Text style={styles.orderSubtotal}>
                  Total: <Text style={styles.orderSubtotalVal}>{sumKcal(ingredients).toLocaleString('es-AR')} kcal</Text>
                </Text>
              </View>
            ) : (
              <View style={styles.manualRowNoBorder}>
                <Text style={styles.manualLabel}>Calorías totales del plato</Text>
                <TextInput
                  style={styles.manualInput}
                  keyboardType="number-pad"
                  value={manualKcal}
                  onChangeText={setManualKcal}
                />
              </View>
            )}
          </View>

          {/* ---- Tarjeta 2: elegir qué agregar (solo en modo "Con ingredientes") ---- */}
          {mode === 'detailed' && (
            <View style={styles.pickerCard}>
              <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar un ingrediente…"
                  placeholderTextColor={colors.muted}
                  value={searchText}
                  onChangeText={setSearchText}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {searchText.length > 0 && (
                  <Pressable hitSlop={8} onPress={() => setSearchText('')} style={styles.searchClear}>
                    <Text style={styles.searchClearText}>✕</Text>
                  </Pressable>
                )}
              </View>

              {searchText.trim() ? (
                <View>
                  {searchResults.length === 0 ? (
                    <Text style={styles.orderEmptyText}>Sin resultados para "{searchText}".</Text>
                  ) : (
                    searchResults.map((item) => (
                      <Pressable key={item.id} style={styles.searchResultRow} onPress={() => quickAddIngredient(item)}>
                        <Text style={styles.searchResultName} numberOfLines={1}>
                          {item.emoji || '🍽️'} {item.name}{item.brand ? ` · ${item.brand}` : ''}
                        </Text>
                        <Text style={styles.searchResultKcal}>{Math.round(item.kcalPer100g)}/100g</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                    {categoryTabs.map((cat) => (
                      <Pressable
                        key={cat}
                        style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                        onPress={() => setActiveCategory(cat)}
                      >
                        <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.grid}>
                    {categoryItems.map((item) => (
                      <Pressable key={item.id} style={styles.item} onPress={() => quickAddIngredient(item)}>
                        <Text style={styles.itemEmoji}>{item.emoji || '🍽️'}</Text>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
                        <Text style={styles.itemPrice}>● {Math.round(item.kcalPer100g)} kcal / 100g</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.editorActions}>
          {recipe && (
            <Pressable style={styles.editorBtnDelete} onPress={handleDelete}>
              <Text style={styles.editorBtnDeleteText}>Borrar</Text>
            </Pressable>
          )}
          <Pressable style={styles.editorBtnSave} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.editorBtnSaveText}>Guardar receta</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ============================================================
   Editor de ingrediente propio
   ============================================================ */
function IngredientEditor({ visible, onClose, ingredient, onSaved, uid }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [kind, setKind] = useState('variable'); // 'variable' | 'fixed'
  const [unit, setUnit] = useState('g');
  const [kcalPer100, setKcalPer100] = useState('0');
  const [desc, setDesc] = useState('');
  const [kcalTotal, setKcalTotal] = useState('0');
  const [saving, setSaving] = useState(false);

  const resetFrom = useCallback(() => {
    if (ingredient) {
      setName(ingredient.name);
      setBrand(ingredient.brand || '');
      setCategory(ingredient.category || CATEGORIES[0]);
      setKind(ingredient.kind);
      setUnit(ingredient.unit || 'g');
      setKcalPer100(String(ingredient.kcalPer100 || 0));
      setDesc(ingredient.desc || '');
      setKcalTotal(String(ingredient.kcalTotal || 0));
    } else {
      setName('');
      setBrand('');
      setCategory(CATEGORIES[0]);
      setKind('variable');
      setUnit('g');
      setKcalPer100('0');
      setDesc('');
      setKcalTotal('0');
    }
  }, [ingredient]);

  const handleSave = async () => {
    if (!name.trim()) return;
    let data;
    if (kind === 'variable') {
      const val = parseInt(kcalPer100, 10) || 0;
      if (val <= 0) return;
      data = { name: name.trim(), brand: brand.trim() || null, category, kind: 'variable', kcalPer100: val, unit };
    } else {
      const val = parseInt(kcalTotal, 10) || 0;
      if (val <= 0) return;
      data = { name: name.trim(), brand: brand.trim() || null, category, kind: 'fixed', desc: desc.trim() || '1 unidad', kcalTotal: val };
    }
    setSaving(true);
    try {
      if (ingredient) {
        await updateMyIngredient(uid, ingredient.id, data);
      } else {
        await addMyIngredient(uid, data);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.warn('No se pudo guardar el ingrediente:', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ingredient) return;
    await deleteMyIngredient(uid, ingredient.id).catch((e) => console.warn(e.message));
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onShow={resetFrom} onRequestClose={onClose}>
      <SafeAreaView style={styles.editorSafeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          <View style={styles.editorHeader}>
            <Pressable style={styles.editorClose} onPress={onClose}>
              <Text style={styles.editorCloseText}>✕</Text>
            </Pressable>
            <Text style={styles.editorTitle}>{ingredient ? 'Editar ingrediente' : 'Nuevo ingrediente'}</Text>
          </View>

          <TextInput
            style={styles.nameInput}
            placeholder="Ej: Fideos secos"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[styles.nameInput, { marginTop: -6 }]}
            placeholder="Marca (opcional)"
            placeholderTextColor={colors.muted}
            value={brand}
            onChangeText={setBrand}
          />

          <Text style={styles.fieldGroupLabel}>FAMILIA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.modeTabs}>
            <Pressable style={[styles.modeTab, kind === 'variable' && styles.modeTabActive]} onPress={() => setKind('variable')}>
              <Text style={[styles.modeTabText, kind === 'variable' && styles.modeTabTextActive]}>Por cantidad</Text>
            </Pressable>
            <Pressable style={[styles.modeTab, kind === 'fixed' && styles.modeTabActive]} onPress={() => setKind('fixed')}>
              <Text style={[styles.modeTabText, kind === 'fixed' && styles.modeTabTextActive]}>Cantidad fija</Text>
            </Pressable>
          </View>

          {kind === 'variable' ? (
            <>
              <View style={styles.manualRow}>
                <Text style={styles.manualLabel}>Cada 100 gramos o mililitros tiene</Text>
                <TextInput
                  style={styles.manualInput}
                  keyboardType="number-pad"
                  value={kcalPer100}
                  onChangeText={setKcalPer100}
                />
              </View>
              <View style={styles.modeTabs}>
                <Pressable style={[styles.modeTab, unit === 'g' && styles.modeTabActive]} onPress={() => setUnit('g')}>
                  <Text style={[styles.modeTabText, unit === 'g' && styles.modeTabTextActive]}>Gramos</Text>
                </Pressable>
                <Pressable style={[styles.modeTab, unit === 'ml' && styles.modeTabActive]} onPress={() => setUnit('ml')}>
                  <Text style={[styles.modeTabText, unit === 'ml' && styles.modeTabTextActive]}>Mililitros</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.manualRow}>
                <Text style={styles.manualLabel}>Descripción de la cantidad (ej: "1 paquete")</Text>
                <TextInput
                  style={styles.nameInput}
                  placeholder="1 paquete"
                  placeholderTextColor={colors.muted}
                  value={desc}
                  onChangeText={setDesc}
                />
              </View>
              <View style={styles.manualRow}>
                <Text style={styles.manualLabel}>Calorías de esa cantidad completa</Text>
                <TextInput
                  style={styles.manualInput}
                  keyboardType="number-pad"
                  value={kcalTotal}
                  onChangeText={setKcalTotal}
                />
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.editorActions}>
          {ingredient && (
            <Pressable style={styles.editorBtnDelete} onPress={handleDelete}>
              <Text style={styles.editorBtnDeleteText}>Borrar</Text>
            </Pressable>
          )}
          <Pressable style={styles.editorBtnSave} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.editorBtnSaveText}>Guardar ingrediente</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressedFeedback: { transform: [{ scale: 0.94 }], opacity: 0.8 },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  frame: { flex: 1, padding: 16 },

  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.goldBright, marginBottom: 2 },
  pageSub: { fontSize: 13.5, color: colors.muted, marginBottom: 14 },

  sectionTabs: { flexDirection: 'row', gap: 4, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, padding: 4, marginBottom: 14 },
  sectionTab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  sectionTabActive: { backgroundColor: colors.panel },
  sectionTabText: { fontSize: 12.5, color: colors.muted },
  sectionTabTextActive: { color: colors.goldBright, fontWeight: '700' },

  listContent: { gap: 10, paddingBottom: 90 },
  emptyList: { alignItems: 'center', padding: 36, paddingVertical: 44, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 16 },
  emptyListIcon: { fontSize: 34, marginBottom: 10, opacity: 0.7 },
  emptyListTitle: { color: colors.parchment, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptyListText: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 240 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    padding: 12,
    minHeight: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  cardEmojiBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 20 },
  cardName: { fontSize: 15, color: colors.parchment, fontWeight: '600' },
  cardNameBrand: { color: colors.muted, fontWeight: '400', fontStyle: 'italic' },
  cardMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  kcalPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  kcalPillText: { fontSize: 13, color: colors.goldBright, fontWeight: '700' },
  kcalPillUnit: { fontSize: 9.5, color: colors.muted },
  cardDelete: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  cardDeleteText: { color: colors.muted, fontSize: 13, opacity: 0.6 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  fabIcon: { fontSize: 30, color: colors.bg, fontWeight: '300', marginTop: -2 },

  editorSafeArea: { flex: 1, backgroundColor: colors.bg },
  editorContent: { padding: 16, paddingBottom: 30 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  editorClose: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' },
  editorCloseText: { color: colors.muted, fontSize: 15 },
  editorTitle: { fontSize: 17, color: colors.goldBright, fontWeight: '700' },

  nameInput: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, color: colors.parchment, fontSize: 16, padding: 12, marginBottom: 20, minHeight: 44 },

  recipeCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  pickerCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },

  fieldGroupLabel: { fontSize: 10, letterSpacing: 0.8, color: colors.muted, marginBottom: 6, marginTop: 4 },
  modeTabs: { flexDirection: 'row', gap: 4, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, padding: 4, marginBottom: 14 },
  modeTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  modeTabActive: { backgroundColor: colors.panel },
  modeTabText: { fontSize: 11.5, color: colors.muted, textAlign: 'center' },
  modeTabTextActive: { color: colors.goldBright, fontWeight: '700' },

  orderPanel: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, padding: 14 },
  orderPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  orderPanelTitle: { fontSize: 10, letterSpacing: 0.6, color: colors.muted },
  orderPanelCount: { fontSize: 10, color: colors.muted },
  orderEmptyText: { color: colors.muted, fontStyle: 'italic', fontSize: 13.5, paddingVertical: 6 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  orderRowName: { flex: 1, color: colors.parchment, fontSize: 13.5 },
  orderRowGrams: { color: colors.muted, fontSize: 11.5, minWidth: 32, textAlign: 'center' },
  orderRowKcal: { color: colors.gold, fontSize: 12 },
  orderRemove: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  orderRemoveText: { color: colors.danger, fontSize: 14 },
  miniBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  miniBtnText: { color: colors.goldBright, fontSize: 15 },
  orderSubtotal: { textAlign: 'right', marginTop: 8, fontSize: 12, color: colors.muted },
  orderSubtotalVal: { color: colors.goldBright, fontWeight: '700' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel2,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    borderRadius: 22,
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  searchBoxFocused: { borderColor: colors.gold, backgroundColor: colors.panel },
  searchIcon: { fontSize: 14, marginRight: 8, opacity: 0.6 },
  searchInput: { flex: 1, minHeight: 46, color: colors.parchment, fontSize: 15 },
  searchClear: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  searchClearText: { color: colors.parchment, fontSize: 11 },
  searchResultRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  searchResultName: { flex: 1, color: colors.parchment, fontSize: 14 },
  searchResultKcal: { color: colors.muted, fontSize: 11.5 },

  categoryRow: { gap: 8, paddingVertical: 4, marginBottom: 10 },
  categoryChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' },
  categoryChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  categoryChipText: { color: colors.muted, fontSize: 12.5 },
  categoryChipTextActive: { color: colors.bg, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '47%', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, padding: 12, minHeight: 44 },
  itemEmoji: { fontSize: 20, marginBottom: 4 },
  itemName: { fontSize: 14, color: colors.parchment },
  itemBrand: { fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: 1 },
  itemPrice: { fontSize: 12, color: colors.goldBright, marginTop: 6 },

  manualRow: { marginBottom: 16 },
  manualRowNoBorder: {},
  manualLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  manualInput: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, color: colors.parchment, fontSize: 22, textAlign: 'center', padding: 14 },

  editorActions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  editorBtnDelete: { flex: 1, minHeight: 46, borderRadius: 9, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  editorBtnDeleteText: { color: colors.danger, fontSize: 12.5, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
  editorBtnSave: { flex: 2, minHeight: 46, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  editorBtnSaveText: { color: colors.bg, fontSize: 12.5, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
});