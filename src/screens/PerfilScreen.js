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
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateProfileFields } from '../storage/profile';
import { setWeightLog, } from '../storage/weightLogs';
import { todayId } from '../storage/days';
import { colors } from '../theme/colors';
import { styles } from './styles/PerfilScreenStyles';

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