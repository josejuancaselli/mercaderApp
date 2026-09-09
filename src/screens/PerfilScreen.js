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
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateProfileFields } from '../storage/profile';
import { setWeightLog, } from '../storage/weightLogs';
import { todayId } from '../storage/days';
import { colors } from '../theme/colors';

const ACTIVITY_LEVELS = [
  { id: 'sedentary', name: 'Trabajo sedentario', desc: 'Oficina, escritorio — te movés poco en el día a día', factor: 1.2 },
  { id: 'moderate', name: 'Trabajo con movimiento o esfuerzo', desc: 'De pie, caminando, o con esfuerzo físico gran parte del día', factor: 1.375 },
];

function calcMantenimiento(profile) {
  const { sex, age, weight, height, activity } = profile;
  const factor = activity === 'moderate' ? 1.375 : 1.2;
  const base =
    sex === 'm'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  return Math.round(base * factor);
}

export default function PerfilScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfileFields(user.uid, {
        sex: profile.sex,
        age: profile.age,
        height: profile.height,
        activity: profile.activity,
        useCustomTdee: profile.useCustomTdee ?? false,
        customTdee: profile.customTdee ?? 2500,
        deficit: profile.deficit,
        targetWeight: profile.targetWeight,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2200);
    } catch (e) {
      console.warn('No se pudo guardar el perfil:', e.message);
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getUserProfile(user.uid);
    setProfile(data);
    setLoading(false);
  }, [user.uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const updateLocal = (fields) => setProfile((p) => ({ ...p, ...fields }));

  const mantenimiento = profile.useCustomTdee ? (profile.customTdee || 0) : calcMantenimiento(profile);
  const deficit = profile.deficit ?? 300;
  const target = Math.max(0, mantenimiento - deficit);
  const remaining = Math.max(0, Math.round((profile.weight - profile.targetWeight) * 10) / 10);

  const openWeightModal = () => {
    setWeightInput(String(profile.weight));
    setWeightModalOpen(true);
  };

  const confirmWeight = () => {
    const value = parseFloat(weightInput.replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      updateLocal({ weight: value });
      setWeightLog(user.uid, todayId(), value).catch((e) => console.warn('No se pudo guardar el registro:', e.message));
    }
    setWeightModalOpen(false);
  };

  const handleLogout = () => signOut(auth);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Perfil</Text>
        <Text style={styles.pageSub}>Tus datos, tu meta y cómo la calculamos</Text>

        <View style={styles.heroCoins}>
          <Text style={styles.heroLabel}>MONEDAS POR DÍA</Text>
          <Text style={styles.heroValue}>
            {mantenimiento.toLocaleString('es-AR')} <Text style={styles.heroUnit}>kcal</Text>
          </Text>
        </View>

        {/* ---- Datos físicos ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TUS DATOS FÍSICOS</Text>
          <Text style={styles.cardHint}>Se usan para calcular tu mantenimiento con la fórmula Mifflin-St Jeor.</Text>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Sexo</Text>
            <View style={styles.sexToggle}>
              <Pressable
                style={({ pressed }) => [styles.sexChip, profile.sex === 'm' && styles.sexChipSelected, pressed && styles.pressedFeedback]}
                onPress={() => updateLocal({ sex: 'm' })}
              >
                <Text style={[styles.sexChipText, profile.sex === 'm' && styles.sexChipTextSelected]}>Hombre</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sexChip, profile.sex === 'f' && styles.sexChipSelected, pressed && styles.pressedFeedback]}
                onPress={() => updateLocal({ sex: 'f' })}
              >
                <Text style={[styles.sexChipText, profile.sex === 'f' && styles.sexChipTextSelected]}>Mujer</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Edad</Text>
            <View style={styles.fieldControl}>
              <TextInput
                style={styles.fieldInput}
                keyboardType="number-pad"
                defaultValue={String(profile.age)}
                onEndEditing={(e) => updateLocal({ age: parseInt(e.nativeEvent.text, 10) || profile.age })}
              />
              <Text style={styles.fieldUnit}>años</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Peso actual</Text>
            <View style={styles.weightDisplay}>
              <Text style={styles.weightVal}>{profile.weight.toFixed(1)} kg</Text>
              <Pressable onPress={openWeightModal}>
                <Text style={styles.updateLink}>Actualizar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Altura</Text>
            <View style={styles.fieldControl}>
              <TextInput
                style={styles.fieldInput}
                keyboardType="number-pad"
                defaultValue={String(profile.height)}
                onEndEditing={(e) => updateLocal({ height: parseInt(e.nativeEvent.text, 10) || profile.height })}
              />
              <Text style={styles.fieldUnit}>cm</Text>
            </View>
          </View>

          <View style={styles.subsectionTitle}>
            <Text style={styles.subsectionTitleText}>NIVEL DE ACTIVIDAD</Text>
          </View>
          <View style={{ gap: 8, marginTop: 8 }}>
            {ACTIVITY_LEVELS.map((level) => {
              const selected = profile.activity === level.id;
              return (
                <Pressable
                  key={level.id}
                  style={({ pressed }) => [styles.activityOpt, selected && styles.activityOptSelected, pressed && styles.pressedFeedback]}
                  onPress={() => updateLocal({ activity: level.id })}
                >
                  <View style={[styles.activityRadio, selected && styles.activityRadioSelected]}>
                    {selected && <View style={styles.activityRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityName}>{level.name}</Text>
                    <Text style={styles.activityDesc}>{level.desc}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---- Objetivo diario ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TU OBJETIVO DIARIO</Text>

          <View style={styles.toggleRow}>
            <Text style={styles.fieldLabel}>Usar un objetivo personalizado</Text>
            <Pressable
              style={[styles.switchTrack, profile.useCustomTdee && styles.switchTrackOn]}
              onPress={() => updateLocal({ useCustomTdee: !profile.useCustomTdee })}
            >
              <View style={[styles.switchKnob, profile.useCustomTdee && styles.switchKnobOn]} />
            </Pressable>
          </View>

          {profile.useCustomTdee && (
            <View style={styles.customTdeeWrap}>
              <TextInput
                style={styles.customTdeeInput}
                keyboardType="number-pad"
                defaultValue={String(profile.customTdee || 2500)}
                onEndEditing={(e) => updateLocal({ customTdee: parseInt(e.nativeEvent.text, 10) || 2500 })}
              />
              <Text style={styles.fieldUnit}>kcal / día</Text>
            </View>
          )}

          <View style={styles.calcChain}>
            <View style={styles.calcItem}>
              <Text style={styles.calcLabel}>MANTEN.</Text>
              <Text style={styles.calcValue}>{mantenimiento.toLocaleString('es-AR')}</Text>
            </View>
            <Text style={styles.calcArrow}>−</Text>
            <View style={styles.calcItem}>
              <Text style={styles.calcLabel}>DÉFICIT</Text>
              <View style={styles.miniStepper}>
                <Pressable style={styles.miniBtn} onPress={() => updateLocal({ deficit: Math.max(100, deficit - 50) })}>
                  <Text style={styles.miniBtnText}>−</Text>
                </Pressable>
                <Text style={styles.calcValueSmall}>{deficit}</Text>
                <Pressable style={styles.miniBtn} onPress={() => updateLocal({ deficit: Math.min(mantenimiento, deficit + 50) })}>
                  <Text style={styles.miniBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.calcArrow}>=</Text>
            <View style={styles.calcItem}>
              <Text style={styles.calcLabel}>OBJETIVO</Text>
              <Text style={[styles.calcValue, styles.calcValueGreen]}>{target.toLocaleString('es-AR')}</Text>
            </View>
          </View>

          {deficit < 300 && (
            <Text style={styles.deficitWarning}>
              Por debajo de 300 kcal no se considera un déficit saludable mínimo. Podés dejarlo así, pero tené cuidado.
            </Text>
          )}
        </View>

        {/* ---- Objetivo de peso ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>OBJETIVO DE PESO</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Peso objetivo</Text>
            <View style={styles.fieldControl}>
              <TextInput
                style={styles.fieldInput}
                keyboardType="decimal-pad"
                defaultValue={String(profile.targetWeight)}
                onEndEditing={(e) => {
                  const v = parseFloat(e.nativeEvent.text.replace(',', '.'));
                  updateLocal({ targetWeight: isNaN(v) ? profile.targetWeight : v });
                }}
              />
              <Text style={styles.fieldUnit}>kg</Text>
            </View>
          </View>
          <View style={styles.goalSummary}>
            <View style={styles.goalSummaryItem}>
              <Text style={styles.goalSummaryLabel}>ACTUAL</Text>
              <Text style={styles.goalSummaryValue}>{profile.weight.toFixed(1)} kg</Text>
            </View>
            <Text style={styles.goalArrow}>→</Text>
            <View style={styles.goalSummaryItem}>
              <Text style={styles.goalSummaryLabel}>FALTAN</Text>
              <Text style={styles.goalSummaryValue}>{remaining.toFixed(1)} kg</Text>
            </View>
            <Text style={styles.goalArrow}>→</Text>
            <View style={styles.goalSummaryItem}>
              <Text style={styles.goalSummaryLabel}>META</Text>
              <Text style={styles.goalSummaryValue}>{profile.targetWeight.toFixed(1)} kg</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressedFeedback]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.saveBtnText}>Guardar perfil</Text>
          )}
        </Pressable>

        {savedToast && (
          <View style={styles.toastWrap} pointerEvents="none">
            <View style={styles.toast}>
              <Text style={styles.toastIcon}>✓</Text>
              <Text style={styles.toastText}>Perfil guardado</Text>
            </View>
          </View>
        )}

        <Pressable style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressedFeedback]} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={weightModalOpen} transparent animationType="fade" onRequestClose={() => setWeightModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Actualizar peso</Text>
            <View style={styles.weightModalRow}>
              <TextInput
                style={styles.weightModalInput}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
                autoFocus
              />
              <Text style={styles.fieldUnit}>kg</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setWeightModalOpen(false)}>
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmWeight}>
                <Text style={styles.modalConfirmBtnText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pressedFeedback: { transform: [{ scale: 0.96 }], opacity: 0.8 },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },

  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.goldBright, marginBottom: 2 },
  pageSub: { fontSize: 13.5, color: colors.muted, marginBottom: 4 },

  heroCoins: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 16, alignItems: 'center' },
  heroLabel: { fontSize: 10.5, letterSpacing: 1, color: colors.muted },
  heroValue: { fontSize: 30, fontWeight: '700', color: colors.goldBright, marginTop: 4 },
  heroUnit: { fontSize: 14, color: colors.muted, fontWeight: '500' },

  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 11, letterSpacing: 0.8, color: colors.goldBright, marginBottom: 4, fontWeight: '700' },
  cardHint: { fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },

  subsectionTitle: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' },
  subsectionTitleText: { fontSize: 10, letterSpacing: 0.8, color: colors.muted },

  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  fieldLabel: { fontSize: 14, color: colors.parchment, flexShrink: 1 },
  fieldControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: { width: 70, height: 40, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 7, color: colors.parchment, fontSize: 15, textAlign: 'center', paddingVertical: 0 },
  fieldUnit: { fontSize: 12, color: colors.muted },

  sexToggle: { flexDirection: 'row', gap: 6 },
  sexChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' },
  sexChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  sexChipText: { fontSize: 13, color: colors.muted },
  sexChipTextSelected: { color: colors.bg, fontWeight: '700' },

  weightDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weightVal: { fontSize: 15, color: colors.goldBright, fontWeight: '700' },
  updateLink: { fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },

  activityOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel2 },
  activityOptSelected: { borderColor: colors.gold },
  activityRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  activityRadioSelected: { borderColor: colors.gold },
  activityRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  activityName: { fontSize: 14, color: colors.parchment },
  activityDesc: { fontSize: 11.5, color: colors.muted, marginTop: 1 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: colors.availableGreen, borderColor: colors.availableGreen },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.parchment, marginLeft: 2 },
  switchKnobOn: { marginLeft: 22 },

  customTdeeWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  customTdeeInput: { width: 100, height: 42, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.gold, borderRadius: 8, color: colors.parchment, fontSize: 17, textAlign: 'center' },

  calcChain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' },
  calcItem: { alignItems: 'center', flexShrink: 1 },
  calcLabel: { fontSize: 9.5, letterSpacing: 0.3, color: colors.muted },
  calcValue: { fontSize: 17, fontWeight: '700', color: colors.goldBright, marginTop: 5 },
  calcValueSmall: { fontSize: 15, fontWeight: '700', color: colors.parchment, minWidth: 40, textAlign: 'center' },
  calcValueGreen: { color: colors.availableGreen },
  calcArrow: { color: colors.muted, fontSize: 15, paddingHorizontal: 2 },
  miniStepper: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  miniBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' },
  miniBtnText: { color: colors.goldBright, fontSize: 14 },
  deficitWarning: { fontSize: 11.5, color: colors.danger, textAlign: 'center', marginTop: 12, lineHeight: 16 },

  goalSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingVertical: 10 },
  goalSummaryItem: { alignItems: 'center', flex: 1 },
  goalSummaryLabel: { fontSize: 10, color: colors.muted, letterSpacing: 0.3 },
  goalSummaryValue: { fontSize: 15, color: colors.goldBright, marginTop: 4, fontWeight: '700' },
  goalArrow: { color: colors.muted, fontSize: 14 },

  logoutBtn: { minHeight: 48, borderRadius: 9, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  logoutBtnText: { color: colors.danger, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,6,4,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 300, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 15, color: colors.goldBright, marginBottom: 14, fontWeight: '700' },
  weightModalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightModalInput: { width: 110, height: 46, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, color: colors.parchment, fontSize: 20, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 18, width: '100%' },
  modalCancelBtn: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtnText: { color: colors.muted, fontSize: 12 },
  modalConfirmBtn: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  modalConfirmBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },

  saveBtn: { minHeight: 48, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  saveBtnText: { color: colors.bg, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
  toastWrap: { position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.availableGreen,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  toastIcon: { color: colors.availableGreen, fontSize: 14, fontWeight: '700' },
  toastText: { color: colors.parchment, fontWeight: '600', fontSize: 13 },
});