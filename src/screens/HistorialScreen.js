import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, yAxisSides } from 'react-native-gifted-charts';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile } from '../storage/profile';
import { getAllDayHistory } from '../storage/dayHistory';
import { getAllWeightLogs, setWeightLog, deleteWeightLog } from '../storage/weightLogs';
import { todayId } from '../storage/days';
import { colors } from '../theme/colors';

const KCAL_PER_KG = 7700;

const PERIODS = [
  { key: '7', label: '7 días', days: 7, mode: 'daily' },
  { key: '15', label: '15 días', days: 15, mode: 'daily' },
  { key: '30', label: '30 días', days: 30, mode: 'weekly' },
  { key: '90', label: '90 días', days: 90, mode: 'weekly' },
  { key: 'total', label: 'Total', days: null, mode: 'monthly' },
];

/* ---- Helpers de fechas: mismo formato YYYY-MM-DD que usa el resto del storage ---- */
function idFor(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseId(id) {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDayMonth(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMonthYear(d) {
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
}

/** Arma un día por cada fecha del rango, uniendo dayHistory (ahorro/boost) y weightLogs (peso). */
function buildDailyRange(days, dayHistoryMap, weightMap) {
  const today = new Date();
  const arr = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const id = idFor(d);
    const hist = dayHistoryMap[id];
    arr.push({
      id,
      dateObj: d,
      saved: hist ? hist.leftover : null,
      boosted: hist ? hist.exerciseBoostKcal > 0 : false,
      weight: weightMap[id] ?? null,
    });
  }
  // Peso: si un día no tiene registro propio, arrastra el último conocido (no inventa datos nuevos).
  let lastWeight = null;
  arr.forEach((day) => {
    if (day.weight != null) lastWeight = day.weight;
    else day.weight = lastWeight;
  });
  return arr;
}

function groupBySize(daily, size) {
  const groups = [];
  for (let i = 0; i < daily.length; i += size) groups.push(daily.slice(i, i + size));
  return groups;
}
function groupByMonth(daily) {
  const map = new Map();
  daily.forEach((d) => {
    const key = `${d.dateObj.getFullYear()}-${d.dateObj.getMonth()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  });
  return Array.from(map.values());
}

/** Agrupa el día a día en los puntos que va a mostrar el gráfico, según el modo del período. */
function buildSeries(period, daily) {
  let groups;
  if (period.mode === 'daily') groups = daily.map((d) => [d]);
  else if (period.mode === 'weekly') groups = groupBySize(daily, 7);
  else groups = groupByMonth(daily);

  const labelFmt = period.mode === 'monthly' ? fmtMonthYear : fmtDayMonth;
  return groups.map((group) => {
    const last = group[group.length - 1];
    const validSaved = group.map((d) => d.saved).filter((v) => v != null);
    const avgSaved = validSaved.length ? Math.round(validSaved.reduce((a, b) => a + b, 0) / validSaved.length) : null;
    return {
      label: labelFmt(last.dateObj),
      saved: avgSaved,
      boosted: group.some((d) => d.boosted),
      weight: last.weight,
    };
  });
}

/** Rango del eje derecho (peso): siempre deja aire arriba y abajo del rango real de ese período. */
function weightAxisRange(weights) {
  if (!weights.length) return { min: 0, max: 1, step: 1, sections: 1 };
  const step = 0.5;
  const current = weights[weights.length - 1];
  const highest = Math.max(...weights);
  const lowest = Math.min(...weights);
  let axisMax = current + 0.2;
  while (axisMax - highest < step) axisMax += step;
  axisMax = Math.round(axisMax * 100) / 100;
  const sections = Math.max(1, Math.ceil((axisMax - lowest) / step)) + 1;
  const axisMin = Math.round((axisMax - sections * step) * 100) / 100;
  return { min: axisMin, max: axisMax, step, sections };
}

/** Rango del eje derecho (calorías ahorradas): redondea a pasos de 200 kcal, siempre con aire arriba. */
function savingsAxisRange(values) {
  const max = values.length ? Math.max(...values) : 0;
  const step = 200;
  const axisMax = Math.max(step * 2, Math.ceil((max + 1) / step) * step);
  return { max: axisMax, sections: Math.round(axisMax / step) };
}

export default function HistorialScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [dayHistory, setDayHistoryData] = useState([]);
  const [weightLogs, setWeightLogsData] = useState([]);
  const [period, setPeriod] = useState(PERIODS[0]);

  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [logListOpen, setLogListOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editingLogValue, setEditingLogValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [p, dh, wl] = await Promise.all([
      getUserProfile(user.uid),
      getAllDayHistory(user.uid),
      getAllWeightLogs(user.uid),
    ]);
    setProfile(p);
    setDayHistoryData(dh);
    setWeightLogsData(wl);
    setLoading(false);
  }, [user.uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dayHistoryMap = useMemo(() => {
    const m = {};
    dayHistory.forEach((d) => { m[d.date] = d; });
    return m;
  }, [dayHistory]);

  const weightMap = useMemo(() => {
    const m = {};
    weightLogs.forEach((w) => { m[w.date] = w.weight; });
    return m;
  }, [weightLogs]);

  const hasAnyData = dayHistory.length > 0 || weightLogs.length > 0;

  const totalDays = useMemo(() => {
    if (!hasAnyData) return 1;
    const allDates = [...dayHistory.map((d) => d.date), ...weightLogs.map((w) => w.date)];
    const earliest = allDates.reduce((min, d) => (d < min ? d : min));
    return Math.round((new Date() - parseId(earliest)) / 86400000) + 1;
  }, [dayHistory, weightLogs, hasAnyData]);

  const daily = useMemo(() => {
    if (!hasAnyData) return [];
    const days = period.days ?? totalDays;
    return buildDailyRange(days, dayHistoryMap, weightMap);
  }, [period, dayHistoryMap, weightMap, totalDays, hasAnyData]);

  const series = useMemo(() => buildSeries(period, daily), [period, daily]);

  // Para el gráfico, recorta el tramo inicial sin ningún peso cargado todavía (evita que la línea arranque en 0).
  const chartSeries = useMemo(() => {
    const firstIdx = series.findIndex((s) => s.weight != null);
    return firstIdx > 0 ? series.slice(firstIdx) : series;
  }, [series]);
  const hasWeightLine = chartSeries.some((s) => s.weight != null);

  /* ---- Resumen del período (sobre el día a día real, no sobre los puntos agrupados) ---- */
  const validSavedDaily = daily.map((d) => d.saved).filter((v) => v != null);
  const totalSavedPeriod = validSavedDaily.reduce((a, b) => a + b, 0);
  const avgSavedPerDay = validSavedDaily.length ? Math.round(totalSavedPeriod / validSavedDaily.length) : 0;

  const weightsInPeriod = daily.map((d) => d.weight).filter((v) => v != null);
  const weightCurrent = weightsInPeriod.length ? weightsInPeriod[weightsInPeriod.length - 1] : profile?.weight ?? null;
  const weightInitial = weightsInPeriod.length ? weightsInPeriod[0] : weightCurrent;
  const wDelta = weightCurrent != null && weightInitial != null ? Math.round((weightCurrent - weightInitial) * 10) / 10 : 0;
  const avgWeightGramsPerDay =
    daily.length && weightCurrent != null && weightInitial != null
      ? Math.round(((weightInitial - weightCurrent) * 1000) / daily.length)
      : 0;

  // El promedio se expresa en la misma unidad que agrupa el gráfico de este período:
  // por semana en 30/90 días (mode 'weekly'), por mes en Total (mode 'monthly'), por día en 7/15.
  let avgWeightLabel;
  if (period.mode === 'monthly') {
    const avgKgPerMonth = Math.round((avgWeightGramsPerDay * 30) / 10) / 100;
    avgWeightLabel =
      avgKgPerMonth > 0 ? `Promedio: -${avgKgPerMonth.toFixed(2)} kg/mes`
      : avgKgPerMonth < 0 ? `Promedio: +${Math.abs(avgKgPerMonth).toFixed(2)} kg/mes`
      : 'Promedio: sin cambios/mes';
  } else if (period.mode === 'weekly') {
    const avgGramsPerWeek = Math.round(avgWeightGramsPerDay * 7);
    avgWeightLabel =
      avgGramsPerWeek > 0 ? `Promedio: -${avgGramsPerWeek} g/semana`
      : avgGramsPerWeek < 0 ? `Promedio: +${Math.abs(avgGramsPerWeek)} g/semana`
      : 'Promedio: sin cambios/semana';
  } else {
    avgWeightLabel =
      avgWeightGramsPerDay > 0 ? `Promedio: -${avgWeightGramsPerDay} g/día`
      : avgWeightGramsPerDay < 0 ? `Promedio: +${Math.abs(avgWeightGramsPerDay)} g/día`
      : 'Promedio: sin cambios/día';
  }

  /* ---- Progreso hacia la meta (independiente del período elegido) ---- */
  const startingWeight = weightLogs.length ? weightLogs[0].weight : profile?.weight ?? 0;
  const currentWeightNow = weightLogs.length ? weightLogs[weightLogs.length - 1].weight : profile?.weight ?? 0;
  const targetWeight = profile?.targetWeight ?? currentWeightNow;
  const totalToLose = startingWeight - targetWeight;
  const lostSoFar = startingWeight - currentWeightNow;
  const goalPct = totalToLose > 0 ? Math.max(0, Math.min(100, Math.round((lostSoFar / totalToLose) * 100))) : 0;
  const goalRemaining = Math.max(0, Math.round((currentWeightNow - targetWeight) * 10) / 10);

  const bankKcal = profile?.bankKcal || 0;

  /* ---- Datos para el gráfico: barras = peso, línea = ahorro de calorías ----
     El eje de peso se "acerca" restando el piso del rango a cada valor antes de graficar,
     y sumándolo de nuevo solo al mostrar la etiqueta — más confiable que depender de un
     offset de eje de la librería, que no se comportó bien en el eje principal (barras). */
  const weightValues = chartSeries.map((s) => s.weight).filter((v) => v != null);
  const axisRange = weightAxisRange(weightValues);
  const barData = chartSeries.map((s) => {
    const w = s.weight ?? axisRange.min;
    return {
      value: Math.max(0, w - axisRange.min),
      label: s.label,
      frontColor: colors.gold,
    };
  });
  const savedValues = chartSeries.map((s) => s.saved).filter((v) => v != null);
  const savingsRange = savingsAxisRange(savedValues);
  const lineData = chartSeries.map((s) => ({
    value: s.saved ?? 0,
    hideDataPoint: !s.boosted,
    dataPointColor: colors.boostBlueBright,
    dataPointRadius: 5,
  }));

  const screenWidth = Dimensions.get('window').width;
  const chartInnerWidth = screenWidth - 32 - 28 - 44 - 50; // padding de página + tarjeta + eje izquierdo + eje derecho
  const useScroll = barData.length > 8;
  const barWidth = useScroll ? 22 : undefined;
  const spacing = useScroll ? 18 : undefined;

  /* ---- Modal: cargar peso de hoy ---- */
  const openWeightModal = () => {
    setWeightInput(profile?.weight ? String(profile.weight) : '');
    setWeightModalOpen(true);
  };
  const confirmWeight = () => {
    const value = parseFloat(weightInput.replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      setWeightLog(user.uid, todayId(), value).catch((e) => console.warn('No se pudo guardar el registro:', e.message));
      setWeightLogsData((prev) => {
        const others = prev.filter((w) => w.date !== todayId());
        return [...others, { date: todayId(), weight: value }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
    }
    setWeightModalOpen(false);
  };

  /* ---- Modal: ver / editar / borrar registros anteriores ---- */
  const openLogList = () => {
    setWeightModalOpen(false);
    setLogListOpen(true);
  };
  const startEditLog = (log) => {
    setEditingLogId(log.date);
    setEditingLogValue(String(log.weight));
  };
  const commitEditLog = (date) => {
    const value = parseFloat(editingLogValue.replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      setWeightLog(user.uid, date, value).catch((e) => console.warn('No se pudo guardar:', e.message));
      setWeightLogsData((prev) => prev.map((w) => (w.date === date ? { ...w, weight: value } : w)));
    }
    setEditingLogId(null);
  };
  const removeLog = (date) => {
    deleteWeightLog(user.uid, date).catch((e) => console.warn('No se pudo borrar:', e.message));
    setWeightLogsData((prev) => prev.filter((w) => w.date !== date));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Historial</Text>
        <Text style={styles.pageSub}>Tu progreso a lo largo del tiempo</Text>

        {!hasAnyData ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Todavía no hay historial</Text>
            <Text style={styles.emptySub}>
              Empezá a registrar tus comidas y a cargar tu peso — en unos días vas a ver acá tu progreso.
            </Text>
            <Pressable style={({ pressed }) => [styles.emptyCta, pressed && styles.pressedFeedback]} onPress={openWeightModal}>
              <Text style={styles.emptyCtaText}>Cargar mi peso inicial</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.periodTabs}>
              {PERIODS.map((p) => (
                <Pressable
                  key={p.key}
                  style={[styles.periodTab, period.key === p.key && styles.periodTabActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodTabText, period.key === p.key && styles.periodTabTextActive]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Text style={styles.goalTitle}>PROGRESO HACIA TU META</Text>
                <Text style={styles.goalPct}>{goalPct}%</Text>
              </View>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
              </View>
              <View style={styles.goalLabels}>
                <Text style={styles.goalLabelText}>Inicio: <Text style={styles.goalLabelBold}>{startingWeight.toFixed(1)} kg</Text></Text>
                <Text style={styles.goalLabelText}>Meta: <Text style={styles.goalLabelBold}>{targetWeight.toFixed(1)} kg</Text></Text>
              </View>
              <Text style={styles.goalRemaining}>
                {goalRemaining > 0 ? <>Te faltan <Text style={styles.goalRemainingBold}>{goalRemaining.toFixed(1)} kg</Text> para tu meta</> : '¡Alcanzaste tu meta!'}
              </Text>
            </View>

            <View style={styles.chartCard}>
              {barData.length > 0 ? (
                <BarChart
                  data={barData}
                  height={220}
                  width={useScroll ? undefined : chartInnerWidth}
                  adjustToWidth={!useScroll}
                  scrollable={useScroll}
                  barWidth={barWidth}
                  spacing={spacing}
                  barBorderRadius={3}
                  frontColor={colors.gold}
                  yAxisThickness={0}
                  xAxisColor={colors.borderSoft}
                  rulesColor="rgba(74,60,40,0.25)"
                  maxValue={axisRange.max - axisRange.min}
                  noOfSections={axisRange.sections}
                  formatYLabel={(label) => `${(Number(label) + axisRange.min).toFixed(1)} kg`}
                  yAxisTextStyle={{ color: colors.gold, fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: colors.muted, fontSize: 11 }}
                  showLine={hasWeightLine}
                  lineData={lineData}
                  lineConfig={{
                    color: colors.parchment,
                    thickness: 2.5,
                    curved: true,
                    curvature: 0.2,
                    hideDataPoints: true,
                    isSecondary: true,
                  }}
                  secondaryYAxis={{
                    maxValue: savingsRange.max,
                    noOfSections: savingsRange.sections,
                    yAxisSide: yAxisSides.RIGHT,
                    yAxisTextStyle: { color: colors.parchment, fontSize: 11 },
                  }}
                />
              ) : (
                <Text style={styles.chartEmpty}>Sin datos suficientes para graficar todavía.</Text>
              )}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colors.gold }]} /><Text style={styles.legendText}>Peso</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.legendSwatchLine, { backgroundColor: colors.parchment }]} /><Text style={styles.legendText}>Ahorro diario</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.legendSwatchLine, { backgroundColor: colors.boostBlueBright }]} /><Text style={styles.legendText}>Día con actividad física</Text></View>
              </View>
            </View>

            <View style={styles.statsCard}>
              <View style={styles.statsTop}>
                <Text style={styles.bankIcon}>🏦</Text>
                <View style={styles.statsTopInfo}>
                  <Text style={styles.statsLabel}>AHORRO TOTAL DESDE QUE EMPEZASTE</Text>
                  <Text style={styles.statsAlltimeValue}>
                    {bankKcal.toLocaleString('es-AR')} kcal <Text style={styles.statsSub}>({(bankKcal / KCAL_PER_KG).toFixed(2)} kg)</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.statsDivider} />

              <View style={styles.statsRow}>
                <View style={styles.statsCol}>
                  <Text style={styles.statsLabel}>PESO</Text>
                  <View style={styles.weightCompareRow}>
                    <Text style={styles.weightInitialInline}>{weightInitial != null ? weightInitial.toFixed(1) : '--'} kg</Text>
                    <Text style={styles.weightCompareArrow}>→</Text>
                    <Text style={styles.weightCurrentInline}>{weightCurrent != null ? weightCurrent.toFixed(1) : '--'} kg</Text>
                  </View>
                  <Text style={[styles.statsDeltaBig, wDelta > 0 && styles.statsDeltaUp]}>
                    {wDelta <= 0 ? wDelta : `+${wDelta}`} kg en el período
                  </Text>
                  <Text style={styles.statsAvgBig}>{avgWeightLabel}</Text>
                </View>
                <View style={styles.statsColDivider} />
                <View style={styles.statsCol}>
                  <Text style={styles.statsLabel}>AHORRADO EN EL PERÍODO</Text>
                  <Text style={[styles.statsValue, styles.statsValueBlue]}>{totalSavedPeriod.toLocaleString('es-AR')} kcal</Text>
                  <Text style={styles.statsDelta}>≈ {(totalSavedPeriod / KCAL_PER_KG).toFixed(2)} kg</Text>
                  <Text style={styles.statsAvg}>Promedio: {avgSavedPerDay.toLocaleString('es-AR')} kcal/día</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Pressable style={({ pressed }) => [styles.fab, pressed && styles.pressedFeedback]} onPress={openWeightModal}>
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* ---- Modal: cargar peso de hoy ---- */}
      <Modal visible={weightModalOpen} transparent animationType="fade" onRequestClose={() => setWeightModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cargar peso de hoy</Text>
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
            <Text style={styles.modalHint}>Este dato actualiza tu historial y recalcula tu mantenimiento a partir de mañana.</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setWeightModalOpen(false)}>
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={confirmWeight}>
                <Text style={styles.modalConfirmBtnText}>Guardar</Text>
              </Pressable>
            </View>
            <Pressable onPress={openLogList}>
              <Text style={styles.logListLink}>Ver y editar registros anteriores</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ---- Modal: listado de registros de peso ---- */}
      <Modal visible={logListOpen} transparent animationType="fade" onRequestClose={() => setLogListOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.logListCard}>
            <View style={styles.logListHeader}>
              <Text style={styles.modalTitle}>Registros de peso</Text>
              <Pressable hitSlop={8} onPress={() => setLogListOpen(false)}>
                <Text style={styles.logListClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.logListScroll}>
              {weightLogs.length === 0 ? (
                <Text style={styles.logListEmpty}>No hay registros cargados.</Text>
              ) : (
                [...weightLogs].reverse().map((log) => (
                  <View key={log.date} style={styles.logRow}>
                    <Text style={styles.logRowDate}>{log.date}</Text>
                    {editingLogId === log.date ? (
                      <TextInput
                        style={styles.logRowInput}
                        keyboardType="decimal-pad"
                        value={editingLogValue}
                        onChangeText={setEditingLogValue}
                        autoFocus
                        onBlur={() => commitEditLog(log.date)}
                        onSubmitEditing={() => commitEditLog(log.date)}
                      />
                    ) : (
                      <Text style={styles.logRowVal}>{log.weight.toFixed(1)} kg</Text>
                    )}
                    <Pressable hitSlop={6} style={styles.logIconBtn} onPress={() => startEditLog(log)}>
                      <Text style={styles.logIconText}>✎</Text>
                    </Pressable>
                    <Pressable hitSlop={6} style={styles.logIconBtn} onPress={() => removeLog(log.date)}>
                      <Text style={[styles.logIconText, styles.logIconDanger]}>🗑</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
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
  scrollContent: { padding: 16, paddingBottom: 100, gap: 14 },

  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.goldBright, marginBottom: 2 },
  pageSub: { fontSize: 13.5, color: colors.muted, marginBottom: 4 },

  emptyState: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, color: colors.goldBright, fontWeight: '700', marginTop: 16 },
  emptySub: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  emptyCta: { marginTop: 20, minHeight: 44, paddingHorizontal: 22, borderRadius: 8, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  emptyCtaText: { color: colors.bg, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },

  periodTabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 9, padding: 4 },
  periodTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  periodTabActive: { backgroundColor: colors.panel },
  periodTabText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  periodTabTextActive: { color: colors.goldBright },

  goalCard: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, padding: 16 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  goalTitle: { fontSize: 11, letterSpacing: 0.8, color: colors.muted, fontWeight: '700' },
  goalPct: { fontSize: 16, color: colors.goldBright, fontWeight: '700' },
  goalTrack: { height: 10, borderRadius: 5, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  goalFill: { height: '100%', backgroundColor: colors.availableGreen },
  goalLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  goalLabelText: { fontSize: 11.5, color: colors.muted },
  goalLabelBold: { color: colors.parchment, fontWeight: '600' },
  goalRemaining: { textAlign: 'center', marginTop: 10, fontSize: 12.5, color: colors.muted, fontStyle: 'italic' },
  goalRemainingBold: { color: colors.goldBright, fontStyle: 'normal', fontWeight: '700' },

  chartCard: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 12, padding: 14, alignItems: 'center' },
  chartEmpty: { color: colors.muted, fontStyle: 'italic', fontSize: 13, paddingVertical: 40 },
  chartLegend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: 3 },
  legendSwatchLine: { borderRadius: 6 },
  legendText: { fontSize: 12, color: colors.muted },

  statsCard: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold, borderRadius: 12, padding: 16 },
  statsTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankIcon: { fontSize: 30 },
  statsTopInfo: { flex: 1 },
  statsLabel: { fontSize: 10.5, letterSpacing: 0.6, color: colors.muted, fontWeight: '700' },
  statsAlltimeValue: { fontSize: 18, color: colors.goldBright, fontWeight: '700', marginTop: 4 },
  statsSub: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  statsDivider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 14 },
  statsRow: { flexDirection: 'row' },
  statsCol: { flex: 1 },
  statsColDivider: { width: 1, backgroundColor: colors.borderSoft, marginHorizontal: 14 },
  statsValue: { fontSize: 19, color: colors.goldBright, fontWeight: '700', marginTop: 6 },
  statsValueBlue: { color: colors.boostBlueBright },
  statsDelta: { fontSize: 12, color: colors.availableGreen, marginTop: 3 },
  statsDeltaUp: { color: colors.danger },
  statsAvg: { fontSize: 11, color: colors.muted, marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' },

  weightCompareRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 },
  weightInitialInline: { fontSize: 12.5, color: colors.muted, fontWeight: '600' },
  weightCompareArrow: { fontSize: 12, color: colors.muted },
  weightCurrentInline: { fontSize: 21, color: colors.goldBright, fontWeight: '700' },
  statsDeltaBig: { fontSize: 14, color: colors.availableGreen, marginTop: 8, fontWeight: '600' },
  statsAvgBig: { fontSize: 12.5, color: colors.muted, marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' },

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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,6,4,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 320, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 15, color: colors.goldBright, marginBottom: 14, fontWeight: '700' },
  modalHint: { fontSize: 11.5, color: colors.muted, marginTop: 10, lineHeight: 16, textAlign: 'center' },
  weightModalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightModalInput: { width: 110, height: 46, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, color: colors.parchment, fontSize: 20, textAlign: 'center' },
  fieldUnit: { fontSize: 13, color: colors.muted },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 18, width: '100%' },
  modalCancelBtn: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtnText: { color: colors.muted, fontSize: 12 },
  modalConfirmBtn: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  modalConfirmBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
  logListLink: { marginTop: 14, fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },

  logListCard: { width: '100%', maxWidth: 420, maxHeight: '78%', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 16 },
  logListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, borderStyle: 'dashed' },
  logListClose: { fontSize: 16, color: colors.muted, padding: 4 },
  logListScroll: { maxHeight: 420 },
  logListEmpty: { textAlign: 'center', color: colors.muted, fontStyle: 'italic', fontSize: 13, paddingVertical: 20 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  logRowDate: { flex: 1, fontSize: 14, color: colors.parchment },
  logRowVal: { fontSize: 14, color: colors.goldBright, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  logRowInput: { width: 64, height: 32, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.gold, borderRadius: 6, color: colors.parchment, fontSize: 14, textAlign: 'center' },
  logIconBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.panel2, alignItems: 'center', justifyContent: 'center' },
  logIconText: { color: colors.muted, fontSize: 13 },
  logIconDanger: { color: colors.danger },
});