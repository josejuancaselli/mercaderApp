import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { completeOnboarding } from '../storage/onboarding';
import { colors } from '../theme/colors';

const ACTIVITY_LEVELS = [
  {
    id: 'sedentary',
    name: 'Trabajo sedentario',
    desc: 'Oficina, escritorio — te movés poco en el día a día',
    factor: 1.2,
  },
  {
    id: 'moderate',
    name: 'Trabajo con movimiento o esfuerzo',
    desc: 'De pie, caminando, o con esfuerzo físico gran parte del día',
    factor: 1.375,
  },
];

const STEP_NAMES = [
  'Sobre vos',
  'Cuerpo',
  'Actividad',
  'Tu bolsa',
  'Tu ritmo',
  'Meta de peso',
  'Listo',
];

function parseDecimal(text) {
  const normalized = text.replace(',', '.');
  const value = parseFloat(normalized);
  return isNaN(value) ? 0 : value;
}

function calcMantenimiento(profile) {
  const { sex, age, weight, height, activity } = profile;
  const base =
    sex === 'm'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  const level = ACTIVITY_LEVELS.find((a) => a.id === activity) || ACTIVITY_LEVELS[0];
  return Math.round(base * level.factor);
}

function isStepValid(step, profile) {
  switch (step) {
    case 0:
      return !!profile.sex && profile.age > 0;
    case 1:
      return profile.weight > 0 && profile.height > 0;
    case 2:
      return !!profile.activity;
    case 3:
      return true;
    case 4:
      return profile.deficit >= 100;
    case 5:
      return profile.targetWeight > 0;
    case 6:
      return true;
    default:
      return false;
  }
}

export default function OnboardingScreen({ onComplete }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    sex: null,
    age: 0,
    weight: 0,
    height: 0,
    activity: null,
    deficit: 300,
    targetWeight: 0,
  });

  const update = (patch) => setProfile((prev) => ({ ...prev, ...patch }));
  const valid = isStepValid(step, profile);

  const goNext = async () => {
    if (!valid) return;
    if (step < STEP_NAMES.length - 1) {
      setStep(step + 1);
    } else {
      setSaving(true);
      await completeOnboarding(user.uid, profile);
      setSaving(false);
      onComplete();
    }
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const mant = calcMantenimiento(profile);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.frame}>
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>
              Paso {step + 1} de {STEP_NAMES.length}
            </Text>
            <Text style={styles.progressLabel}>{STEP_NAMES[step]}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((step + 1) / STEP_NAMES.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.stepCard}>
          <ScrollView contentContainerStyle={styles.stepBody}>
            {step === 0 && <StepSobreVos profile={profile} update={update} />}
            {step === 1 && <StepCuerpo profile={profile} update={update} />}
            {step === 2 && <StepActividad profile={profile} update={update} />}
            {step === 3 && <StepTuBolsa mant={mant} />}
            {step === 4 && <StepTuRitmo profile={profile} update={update} mant={mant} />}
            {step === 5 && <StepMetaPeso profile={profile} update={update} />}
            {step === 6 && <StepResumen profile={profile} mant={mant} />}
          </ScrollView>

          <View style={styles.navRow}>
            <Pressable
              style={[styles.navBtn, styles.backBtn, step === 0 && styles.hidden]}
              onPress={goBack}
            >
              <Text style={styles.backBtnText}>←</Text>
            </Pressable>
            <Pressable
              style={[styles.navBtn, styles.nextBtn, !valid && styles.disabledBtn]}
              onPress={goNext}
              disabled={!valid || saving}
            >
              <Text style={[styles.nextBtnText, !valid && styles.disabledBtnText]}>
                {saving
                  ? 'Guardando…'
                  : step === STEP_NAMES.length - 1
                  ? 'Empezar a comerciar'
                  : 'Siguiente'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function StepSobreVos({ profile, update }) {
  return (
    <View>
      <Text style={styles.stepTitle}>Antes de abrir el puesto</Text>
      <Text style={styles.stepSub}>
        El mercader necesita saber quién sos para calcular tu bolsa de monedas diaria.
      </Text>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Sexo</Text>
        <View style={styles.sexToggle}>
          <Pressable
            style={[styles.sexChip, profile.sex === 'f' && styles.sexChipSelected]}
            onPress={() => update({ sex: 'f' })}
          >
            <Text style={[styles.sexChipText, profile.sex === 'f' && styles.sexChipTextSelected]}>
              Mujer
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sexChip, profile.sex === 'm' && styles.sexChipSelected]}
            onPress={() => update({ sex: 'm' })}
          >
            <Text style={[styles.sexChipText, profile.sex === 'm' && styles.sexChipTextSelected]}>
              Hombre
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Edad</Text>
        <View style={styles.fieldControl}>
          <TextInput
            style={styles.fieldInput}
            keyboardType="number-pad"
            value={profile.age ? String(profile.age) : ''}
            onChangeText={(t) => update({ age: parseInt(t, 10) || 0 })}
            placeholder="—"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.fieldUnit}>años</Text>
        </View>
      </View>
    </View>
  );
}

function StepCuerpo({ profile, update }) {
  return (
    <View>
      <Text style={styles.stepTitle}>Tu cuerpo</Text>
      <Text style={styles.stepSub}>
        Estos datos alimentan el cálculo de mantenimiento (fórmula Mifflin-St Jeor).
      </Text>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Peso</Text>
        <View style={styles.fieldControl}>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={profile.weight ? String(profile.weight) : ''}
            onChangeText={(t) => update({ weight: parseDecimal(t) })}
            placeholder="—"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.fieldUnit}>kg</Text>
        </View>
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Altura</Text>
        <View style={styles.fieldControl}>
          <TextInput
            style={styles.fieldInput}
            keyboardType="number-pad"
            value={profile.height ? String(profile.height) : ''}
            onChangeText={(t) => update({ height: parseInt(t, 10) || 0 })}
            placeholder="—"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.fieldUnit}>cm</Text>
        </View>
      </View>
    </View>
  );
}

function StepActividad({ profile, update }) {
  return (
    <View>
      <Text style={styles.stepTitle}>Tu movimiento habitual</Text>
      <Text style={styles.stepSub}>
        No cuentes acá el ejercicio — eso se carga aparte, en Mercader.
      </Text>

      <View style={{ gap: 9 }}>
        {ACTIVITY_LEVELS.map((level) => {
          const selected = profile.activity === level.id;
          return (
            <Pressable
              key={level.id}
              style={[styles.activityOpt, selected && styles.activityOptSelected]}
              onPress={() => update({ activity: level.id })}
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
  );
}

function StepTuBolsa({ mant }) {
  return (
    <View>
      <Text style={styles.stepTitle}>Tu bolsa diaria</Text>
      <Text style={styles.stepSub}>
        Con estos datos, esto es lo que tu cuerpo gasta por día en mantenimiento.
      </Text>

      <View style={styles.heroCoins}>
        <Text style={styles.heroLabel}>MANTENIMIENTO ESTIMADO</Text>
        <Text style={styles.heroValue}>
          {mant.toLocaleString('es-AR')} <Text style={styles.heroUnit}>kcal</Text>
        </Text>
        <Text style={styles.heroFlavor}>
          Esta es tu bolsa llena, antes de aplicar ningún déficit. En el próximo paso
          definimos cuánto vas a dejar sin gastar cada día.
        </Text>
      </View>
    </View>
  );
}

function StepTuRitmo({ profile, update, mant }) {
  const objetivo = mant - profile.deficit;
  return (
    <View>
      <Text style={styles.stepTitle}>Tu ritmo</Text>
      <Text style={styles.stepSub}>
        El déficit es lo que le restás a tu mantenimiento cada día. Podés ajustarlo
        después desde Perfil.
      </Text>

      <View style={styles.calcChain}>
        <View style={styles.calcItem}>
          <Text style={styles.calcLabel}>MANTEN.</Text>
          <Text style={styles.calcValue} numberOfLines={1} adjustsFontSizeToFit>
            {mant.toLocaleString('es-AR')}
          </Text>
        </View>
        <Text style={styles.calcArrow}>−</Text>
        <View style={styles.calcItem}>
          <Text style={styles.calcLabel}>DÉFICIT</Text>
          <View style={styles.miniStepper}>
            <Pressable
              style={styles.miniBtn}
              onPress={() => update({ deficit: Math.max(100, profile.deficit - 50) })}
            >
              <Text style={styles.miniBtnText}>−</Text>
            </Pressable>
            <Text style={styles.calcValueSmall}>{profile.deficit}</Text>
            <Pressable
              style={styles.miniBtn}
              onPress={() => update({ deficit: Math.min(mant, profile.deficit + 50) })}
            >
              <Text style={styles.miniBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.calcArrow}>=</Text>
        <View style={styles.calcItem}>
          <Text style={styles.calcLabel}>OBJETIVO</Text>
          <Text
            style={[styles.calcValue, styles.calcValueGreen]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {objetivo.toLocaleString('es-AR')}
          </Text>
        </View>
      </View>

      {profile.deficit < 300 && (
        <View style={styles.deficitWarning}>
          <Text style={styles.deficitWarningText}>
            Por debajo de 300 kcal no se considera un déficit saludable mínimo. Podés
            dejarlo así, pero tené cuidado.
          </Text>
        </View>
      )}
    </View>
  );
}

function StepMetaPeso({ profile, update }) {
  const targetWeight = profile.targetWeight || profile.weight;
  const remaining = Math.max(0, Math.round((profile.weight - targetWeight) * 10) / 10);

  return (
    <View>
      <Text style={styles.stepTitle}>Meta de peso</Text>
      <Text style={styles.stepSub}>
        ¿A qué peso querés llegar? Después vas a poder cambiarlo desde Perfil.
      </Text>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Peso objetivo</Text>
        <View style={styles.fieldControl}>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={profile.targetWeight ? String(profile.targetWeight) : ''}
            onChangeText={(t) => update({ targetWeight: parseDecimal(t) })}
            placeholder={String(profile.weight)}
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.fieldUnit}>kg</Text>
        </View>
      </View>

      <View style={styles.goalSummary}>
        <View style={styles.goalSummaryItem}>
          <Text style={styles.goalSummaryLabel}>ACTUAL</Text>
          <Text style={styles.goalSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {profile.weight.toFixed(1)} kg
          </Text>
        </View>
        <Text style={styles.goalArrow}>→</Text>
        <View style={styles.goalSummaryItem}>
          <Text style={styles.goalSummaryLabel}>FALTAN</Text>
          <Text style={styles.goalSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {remaining.toFixed(1)} kg
          </Text>
        </View>
        <Text style={styles.goalArrow}>→</Text>
        <View style={styles.goalSummaryItem}>
          <Text style={styles.goalSummaryLabel}>META</Text>
          <Text style={styles.goalSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {targetWeight.toFixed(1)} kg
          </Text>
        </View>
      </View>
    </View>
  );
}

function StepResumen({ profile, mant }) {
  const level = ACTIVITY_LEVELS.find((a) => a.id === profile.activity);
  const objetivo = mant - profile.deficit;

  const rows = [
    ['Sexo', `${profile.sex === 'm' ? 'Hombre' : 'Mujer'}, ${profile.age} años`],
    ['Cuerpo', `${profile.weight.toFixed(1)} kg · ${profile.height} cm`],
    ['Actividad', level?.name ?? ''],
    ['Mantenimiento', `${mant.toLocaleString('es-AR')} kcal`],
    ['Objetivo diario', `${objetivo.toLocaleString('es-AR')} kcal`],
    ['Meta de peso', `${profile.targetWeight.toFixed(1)} kg`],
  ];

  return (
    <View>
      <Text style={styles.stepTitle}>El puesto está listo</Text>
      <Text style={styles.stepSub}>
        Así arranca tu mercader. Todo esto lo podés cambiar después desde Perfil.
      </Text>

      <View>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.summaryRow}>
            <Text style={styles.summaryK}>{k}</Text>
            <Text style={styles.summaryV}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  frame: { flex: 1, padding: 16 },
  progressWrap: { marginBottom: 16 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.gold },

  stepCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  stepBody: { padding: 20 },
  stepTitle: { fontSize: 19, fontWeight: '700', color: colors.goldBright, marginBottom: 6 },
  stepSub: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 20 },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  fieldLabel: { fontSize: 15, color: colors.parchment },
  fieldControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: {
    width: 84,
    height: 44,
    paddingVertical: 0,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    color: colors.parchment,
    fontSize: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  fieldUnit: { fontSize: 12.5, color: colors.muted, width: 30, textAlign: 'left' },

  sexToggle: { flexDirection: 'row', gap: 8 },
  sexChip: {
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel2,
  },
  sexChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  sexChipText: { fontSize: 14, color: colors.muted },
  sexChipTextSelected: { color: colors.bg, fontWeight: '700' },

  activityOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel2,
  },
  activityOptSelected: { borderColor: colors.gold },
  activityRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityRadioSelected: { borderColor: colors.gold },
  activityRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  activityName: { fontSize: 14.5, color: colors.parchment },
  activityDesc: { fontSize: 12, color: colors.muted, marginTop: 1 },

  heroCoins: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  heroValue: { fontSize: 40, fontWeight: '700', color: colors.goldBright, marginTop: 6 },
  heroUnit: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  heroFlavor: { fontSize: 13, color: colors.muted, marginTop: 10, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' },

  calcChain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
  },
  calcItem: { alignItems: 'center', flexShrink: 1, minWidth: 0 },
  calcLabel: { fontSize: 9.5, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.muted, marginBottom: 4 },
  calcValue: { fontSize: 16, fontWeight: '700', color: colors.parchment, textAlign: 'center' },
  calcValueSmall: { fontSize: 15, fontWeight: '700', color: colors.parchment, minWidth: 36, textAlign: 'center' },
  calcValueGreen: { color: colors.availableGreen },
  calcArrow: { fontSize: 16, color: colors.muted, width: 16, textAlign: 'center', flexShrink: 0, marginTop: 18 },
  miniStepper: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnText: { color: colors.goldBright, fontSize: 15 },

  deficitWarning: {
    marginTop: 10,
    padding: 12,
    backgroundColor: 'rgba(163,77,66,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(163,77,66,0.3)',
    borderRadius: 8,
  },
  deficitWarningText: { fontSize: 12, color: colors.danger, lineHeight: 17 },

  goalSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
  },
  goalSummaryItem: { alignItems: 'center', flexShrink: 1, minWidth: 0, flexBasis: 0, flexGrow: 1 },
  goalSummaryLabel: { fontSize: 9.5, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.muted, marginBottom: 4 },
  goalSummaryValue: { fontSize: 13.5, fontWeight: '700', color: colors.goldBright },
  goalArrow: { fontSize: 13, color: colors.muted, width: 16, textAlign: 'center', flexShrink: 0 },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  summaryK: { color: colors.muted, fontSize: 14 },
  summaryV: { color: colors.parchment, fontWeight: '700', fontSize: 14 },

  navRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  navBtn: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  backBtn: { width: 44, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft },
  backBtnText: { color: colors.muted, fontSize: 16 },
  nextBtn: { flex: 1, backgroundColor: colors.gold },
  disabledBtn: { backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border },
  nextBtnText: { color: colors.bg, fontWeight: '700', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  disabledBtnText: { color: colors.muted },
});