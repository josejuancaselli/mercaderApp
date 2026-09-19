import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
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
import { styles } from './styles/RecetasScreenStyles';


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
                      {r.mode === 'simple'
                        ? (r.scalable && r.totalWeightG ? `Total manual · ${r.totalWeightG} g` : 'Total manual')
                        : `${r.ingredients?.length || 0} ingredientes`}
                      {r.scalable ? ' · porcionable' : ''}
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
                  <Text style={styles.cardMeta}>
                    {ing.unitLabel ? `1 ${ing.unitLabel} = ${ing.unitAmount}${ing.unit === 'ml' ? 'ml' : 'g'}` : `Por cantidad (${ing.unit === 'ml' ? 'ml' : 'g'})`}
                  </Text>
                </View>
                <View style={styles.kcalPill}>
                  <Text style={styles.kcalPillText}>
                    {Math.round(ing.kcalPer100 || 0)}
                  </Text>
                  <Text style={styles.kcalPillUnit}>
                    /100{ing.unit === 'ml' ? 'ml' : 'g'}
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
  const [scalable, setScalable] = useState(false); // preparación grande / batch cooking
  const [ingredients, setIngredients] = useState([]);
  const [manualKcal, setManualKcal] = useState('0');
  const [totalWeightG, setTotalWeightG] = useState(''); // solo si scalable && mode 'simple'; opcional
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quantityModalItem, setQuantityModalItem] = useState(null);
  const [quantityModalAmount, setQuantityModalAmount] = useState('');
  const [quantityModalUnitMode, setQuantityModalUnitMode] = useState('g'); // 'g' | 'unit'

  const resetFrom = useCallback(() => {
    if (recipe) {
      setName(recipe.name);
      setMode(recipe.mode);
      setIngredients(recipe.ingredients || []);
      setManualKcal(String(recipe.totalKcal || 0));
      setScalable(!!recipe.scalable);
      setTotalWeightG(recipe.totalWeightG ? String(recipe.totalWeightG) : '');
    } else {
      setName('');
      setMode('detailed');
      setIngredients([]);
      setManualKcal('0');
      setScalable(false);
      setTotalWeightG('');
    }
    setSearchText('');
    setActiveCategory(CATEGORIES[0]);
  }, [recipe]);

  const allPickableIngredients = [
    ...myIngredients
      .filter((i) => i.kcalPer100)
      .map((i) => ({
        id: i.id,
        name: i.name,
        brand: i.brand,
        emoji: '🧾',
        kcalPer100g: i.kcalPer100,
        category: i.category || 'Otros',
        unitLabel: i.unitLabel || null,
        unitAmount: i.unitAmount || null,
      })),
    ...sharedIngredients,
  ];

  const searchResults = searchText.trim()
    ? allPickableIngredients.filter((i) => i.name.toLowerCase().includes(searchText.trim().toLowerCase()))
    : [];

  const categoryTabs = CATEGORIES;
  const categoryItems = allPickableIngredients.filter((i) => i.category === activeCategory);

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
    if (!quantityModalItem || quantityModalAmountNum <= 0) return;
    const item = quantityModalItem;
    setIngredients((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.name,
        kcalPer100g: item.kcalPer100g,
        amountG: Math.round(quantityModalAmountG),
        kcal: quantityModalKcal,
      },
    ]);
    setQuantityModalItem(null);
    setQuantityModalAmount('');
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
      // Preparación grande (batch cooking): si está activado, esta receta se agrega
      // pidiendo cantidad en vez de entera. En modo 'detailed' el peso sale solo (suma
      // de amountG); en modo 'simple' depende del campo opcional de abajo.
      scalable,
      totalWeightG: mode === 'simple' && scalable ? (parseInt(totalWeightG, 10) || null) : null,
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

          <View style={styles.recipeCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.fieldLabel}>Es una preparación grande</Text>
                <Text style={styles.manualHint}>
                  Activalo si cocinás de una vez para varios días (ej. arroz con pollo) y después querés elegir cuánto comiste cada vez. Para un plato de una sola porción, dejalo apagado — se va a agregar entero de un toque.
                </Text>
              </View>
              <Pressable
                style={[styles.switchTrack, scalable && styles.switchTrackOn]}
                onPress={() => setScalable((v) => !v)}
              >
                <View style={[styles.switchKnob, scalable && styles.switchKnobOn]} />
              </Pressable>
            </View>
          </View>

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
                {scalable && (
                  <>
                    <Text style={[styles.manualLabel, { marginTop: 16 }]}>
                      Peso total de la preparación (opcional)
                    </Text>
                    <TextInput
                      style={styles.manualInput}
                      keyboardType="number-pad"
                      placeholder="Ej: 1000"
                      placeholderTextColor={colors.muted}
                      value={totalWeightG}
                      onChangeText={setTotalWeightG}
                    />
                    <Text style={styles.manualHint}>
                      Sin este dato no vas a poder elegir cuánto comiste — la receta se va a agregar siempre completa.
                    </Text>
                  </>
                )}
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
                      <Pressable key={item.id} style={styles.searchResultRow} onPress={() => openQuantityModal(item)}>
                        <Text style={styles.searchResultName} numberOfLines={1}>
                          {item.emoji || '🍽️'} {item.name}{item.brand ? ` · ${item.brand}` : ''}
                        </Text>
                        <Text style={styles.searchResultKcal}>
                          {item.unitLabel
                            ? `1 ${item.unitLabel} · ${Math.round((item.kcalPer100g * item.unitAmount) / 100)} kcal`
                            : `${Math.round(item.kcalPer100g)}/100g`}
                        </Text>
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
                      <Pressable key={item.id} style={styles.item} onPress={() => openQuantityModal(item)}>
                        <Text style={styles.itemEmoji}>{item.emoji || '🍽️'}</Text>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
                        <Text style={styles.itemPrice}>
                          {item.unitLabel
                            ? `● 1 ${item.unitLabel} · ${Math.round((item.kcalPer100g * item.unitAmount) / 100)} kcal`
                            : `● ${Math.round(item.kcalPer100g)} kcal / 100g`}
                        </Text>
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
                {quantityModalUnitMode === 'unit' ? quantityModalItem?.unitLabel : 'gramos'}
              </Text>
              <Text style={styles.quantityPanelKcal}>{quantityModalKcal} kcal</Text>
            </View>
            {quantityModalUnitMode === 'unit' && quantityModalAmountNum > 0 && (
              <Text style={styles.exerciseSourceNote}>≈ {Math.round(quantityModalAmountG)} g en total</Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.qpAddBtn,
                quantityModalAmountNum <= 0 && styles.qpAddBtnDisabled,
                pressed && styles.pressedFeedback,
              ]}
              onPress={confirmQuantityModal}
              disabled={quantityModalAmountNum <= 0}
            >
              <Text style={styles.qpAddBtnText}>Agregar</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setQuantityModalItem(null)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  const [mode, setMode] = useState('rate'); // 'rate' (por 100g/ml) | 'unit' (por unidad, ej. "1 huevo")
  const [unit, setUnit] = useState('g');
  const [kcalPer100, setKcalPer100] = useState('0');
  const [unitLabel, setUnitLabel] = useState('');
  const [unitAmount, setUnitAmount] = useState('');
  const [unitKcal, setUnitKcal] = useState('0');
  const [saving, setSaving] = useState(false);

  const resetFrom = useCallback(() => {
    if (ingredient) {
      const hasUnit = !!(ingredient.unitLabel && ingredient.unitAmount);
      setName(ingredient.name);
      setBrand(ingredient.brand || '');
      setCategory(ingredient.category || CATEGORIES[0]);
      setUnit(ingredient.unit || 'g');
      setMode(hasUnit ? 'unit' : 'rate');
      setKcalPer100(String(ingredient.kcalPer100 || 0));
      setUnitLabel(ingredient.unitLabel || '');
      setUnitAmount(ingredient.unitAmount ? String(ingredient.unitAmount) : '');
      setUnitKcal(
        hasUnit ? String(Math.round((ingredient.kcalPer100 * ingredient.unitAmount) / 100)) : '0'
      );
    } else {
      setName('');
      setBrand('');
      setCategory(CATEGORIES[0]);
      setMode('rate');
      setUnit('g');
      setKcalPer100('0');
      setUnitLabel('');
      setUnitAmount('');
      setUnitKcal('0');
    }
  }, [ingredient]);

  const unitAmountNum = parseFloat(unitAmount.replace(',', '.')) || 0;
  const unitKcalNum = parseInt(unitKcal, 10) || 0;
  const derivedRate = unitAmountNum > 0 ? Math.round((unitKcalNum / unitAmountNum) * 100) : 0;

  const handleSave = async () => {
    if (!name.trim()) return;
    let data;
    if (mode === 'rate') {
      const val = parseInt(kcalPer100, 10) || 0;
      if (val <= 0) return;
      data = { name: name.trim(), brand: brand.trim() || null, category, kcalPer100: val, unit, unitLabel: null, unitAmount: null };
    } else {
      if (!unitLabel.trim() || unitAmountNum <= 0 || unitKcalNum <= 0) return;
      data = {
        name: name.trim(),
        brand: brand.trim() || null,
        category,
        kcalPer100: derivedRate,
        unit,
        unitLabel: unitLabel.trim(),
        unitAmount: unitAmountNum,
      };
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
            <Pressable style={[styles.modeTab, mode === 'rate' && styles.modeTabActive]} onPress={() => setMode('rate')}>
              <Text style={[styles.modeTabText, mode === 'rate' && styles.modeTabTextActive]}>Por cantidad</Text>
            </Pressable>
            <Pressable style={[styles.modeTab, mode === 'unit' && styles.modeTabActive]} onPress={() => setMode('unit')}>
              <Text style={[styles.modeTabText, mode === 'unit' && styles.modeTabTextActive]}>Por unidad</Text>
            </Pressable>
          </View>

          {mode === 'rate' ? (
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
                <Text style={styles.manualLabel}>Nombre de la unidad (ej: "huevo", "barrita", "cucharada")</Text>
                <TextInput
                  style={styles.nameInput}
                  placeholder="unidad"
                  placeholderTextColor={colors.muted}
                  value={unitLabel}
                  onChangeText={setUnitLabel}
                />
              </View>
              <View style={styles.manualRow}>
                <Text style={styles.manualLabel}>Cuánto pesa 1 {unitLabel.trim() || 'unidad'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.manualInput, { flex: 1 }]}
                    keyboardType="decimal-pad"
                    value={unitAmount}
                    onChangeText={setUnitAmount}
                  />
                  <Text style={styles.manualLabel}>{unit === 'ml' ? 'ml' : 'g'}</Text>
                </View>
              </View>
              <View style={styles.modeTabs}>
                <Pressable style={[styles.modeTab, unit === 'g' && styles.modeTabActive]} onPress={() => setUnit('g')}>
                  <Text style={[styles.modeTabText, unit === 'g' && styles.modeTabTextActive]}>Gramos</Text>
                </Pressable>
                <Pressable style={[styles.modeTab, unit === 'ml' && styles.modeTabActive]} onPress={() => setUnit('ml')}>
                  <Text style={[styles.modeTabText, unit === 'ml' && styles.modeTabTextActive]}>Mililitros</Text>
                </Pressable>
              </View>
              <View style={styles.manualRow}>
                <Text style={styles.manualLabel}>Calorías de esa {unitLabel.trim() || 'unidad'}</Text>
                <TextInput
                  style={styles.manualInput}
                  keyboardType="number-pad"
                  value={unitKcal}
                  onChangeText={setUnitKcal}
                />
              </View>
              {unitAmountNum > 0 && unitKcalNum > 0 && (
                <Text style={styles.orderEmptyText}>≈ {derivedRate} kcal / 100{unit}</Text>
              )}
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