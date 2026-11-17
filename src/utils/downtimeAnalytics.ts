import {
  DailyMetric,
  DimensionBreakdown,
  DimensionObservation,
  DowntimeAnalytics,
  DowntimeEvent,
  MonthlyComparisonRow,
} from '../types/csv';

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthIdx = Number(month) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${MONTH_NAMES_ES[monthIdx]} ${year}`;
  }
  return monthKey;
}

export function formatShortDateLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function formatMinutesAsHours(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  if (rounded < 60) return `${rounded} min`;
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractUnitOptions(events: DowntimeEvent[]): string[] {
  const units = new Set<string>();
  const codePattern = /\b(PP\d+|PM\d+|PL\d+|PH\d+|PR\d+|ES\d+|H\d+|L\d+)\b/gi;
  const shortCodeExact = /^[A-Z]{1,4}\d{1,3}$/;

  for (const ev of events) {
    const candidates = [ev.centro, ev.grupo, ev.maquina];
    for (const field of candidates) {
      const trimmed = (field || '').trim();
      if (!trimmed || trimmed === 'Sin especificar' || trimmed === 'Sin grupo' || trimmed === 'Sin máquina') {
        continue;
      }
      const upper = trimmed.toUpperCase();
      if (shortCodeExact.test(upper)) {
        units.add(upper);
      }
      const matches = upper.match(codePattern);
      if (matches) {
        for (const m of matches) {
          units.add(m.toUpperCase());
        }
      }
    }
  }

  return Array.from(units).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export function eventMatchesUnit(ev: DowntimeEvent, unit: string): boolean {
  if (!unit || unit === 'all') return true;
  const target = unit.trim();
  if (!target) return true;
  const targetLower = target.toLowerCase();
  const compactTarget = targetLower.replace(/[-_\s]+/g, '');
  const boundaryRegex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(targetLower)}([^a-z0-9]|$)`, 'i');

  const fields = [ev.centro, ev.grupo, ev.maquina, ev.proceso];
  return fields.some((f) => {
    const val = (f || '').trim().toLowerCase();
    if (!val) return false;
    if (val === targetLower || boundaryRegex.test(val)) return true;
    const compactVal = val.replace(/[-_\s]+/g, '');
    return compactVal === compactTarget;
  });
}

export interface DowntimeFilterCriteria {
  unit?: string;
  month?: string;
  sector?: string;
  process?: string;
  group?: string;
  machine?: string;
  motivo?: string;
  type?: 'all' | 'vacios' | 'paradas';
  searchQuery?: string;
}

export function filterDowntimeEvents(
  events: DowntimeEvent[],
  criteria: DowntimeFilterCriteria
): DowntimeEvent[] {
  const unit = criteria.unit ?? 'all';
  const month = criteria.month ?? 'all';
  const sector = (criteria.sector ?? 'all').trim().toLowerCase();
  const process = (criteria.process ?? 'all').trim().toLowerCase();
  const group = (criteria.group ?? 'all').trim().toLowerCase();
  const machine = (criteria.machine ?? 'all').trim().toLowerCase();
  const motivo = (criteria.motivo ?? 'all').trim().toLowerCase();
  const type = criteria.type ?? 'all';
  const q = (criteria.searchQuery ?? '').trim().toLowerCase();

  return events.filter((ev) => {
    if (unit !== 'all' && !eventMatchesUnit(ev, unit)) return false;
    if (month !== 'all' && ev.monthKey !== month) return false;
    if (sector !== 'all' && ev.centro.trim().toLowerCase() !== sector) return false;
    if (process !== 'all' && ev.proceso.trim().toLowerCase() !== process) return false;
    if (group !== 'all' && ev.grupo.trim().toLowerCase() !== group) return false;
    if (machine !== 'all' && ev.maquina.trim().toLowerCase() !== machine) return false;
    if (motivo !== 'all' && ev.motivo.trim().toLowerCase() !== motivo) return false;
    if (type === 'vacios' && !ev.isVacio) return false;
    if (type === 'paradas' && ev.isVacio) return false;

    if (q) {
      const haystack = `${ev.centro} ${ev.maquina} ${ev.turno} ${ev.proceso} ${ev.grupo} ${ev.motivo} ${ev.producto} ${ev.numeroAvisoSap} ${ev.observaciones}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

function buildDimensionBreakdown(
  events: DowntimeEvent[],
  getKey: (ev: DowntimeEvent) => string,
  totalMinutes: number,
  sortBy: 'minutes' | 'count' = 'minutes',
  periodUniqueDays = 1
): DimensionBreakdown[] {
  const map = new Map<
    string,
    {
      displayName: string;
      minutes: number;
      vacioMinutes: number;
      paradaMinutes: number;
      count: number;
      vacioCount: number;
      paradaCount: number;
      datesSet: Set<string>;
      sampleNotice?: string;
      observationsMap: Map<
        string,
        {
          text: string;
          minutes: number;
          count: number;
          machines: Set<string>;
          dates: Set<string>;
          notices: Set<string>;
        }
      >;
    }
  >();

  for (const ev of events) {
    const display = getKey(ev).trim() || 'Sin especificar';
    const normKey = display.toLowerCase();
    const current = map.get(normKey) ?? {
      displayName: display,
      minutes: 0,
      vacioMinutes: 0,
      paradaMinutes: 0,
      count: 0,
      vacioCount: 0,
      paradaCount: 0,
      datesSet: new Set<string>(),
      sampleNotice: ev.numeroAvisoSap !== '—' ? ev.numeroAvisoSap : undefined,
      observationsMap: new Map(),
    };

    current.minutes += ev.duracionMinutos;
    current.count += 1;
    if (ev.fechaIso) {
      current.datesSet.add(ev.fechaIso);
    }
    if (ev.isVacio) {
      current.vacioMinutes += ev.duracionMinutos;
      current.vacioCount += 1;
    } else {
      current.paradaMinutes += ev.duracionMinutos;
      current.paradaCount += 1;
    }
    if (!current.sampleNotice && ev.numeroAvisoSap !== '—') {
      current.sampleNotice = ev.numeroAvisoSap;
    }

    const obsRaw = (ev.observaciones || '').trim();
    const obsLower = obsRaw.toLowerCase();
    if (
      obsRaw &&
      obsRaw !== '—' &&
      obsRaw !== '-' &&
      obsLower !== 'sin observaciones' &&
      obsLower !== 'n/a'
    ) {
      const obsKey = obsLower;
      const existingObs = current.observationsMap.get(obsKey) ?? {
        text: obsRaw,
        minutes: 0,
        count: 0,
        machines: new Set<string>(),
        dates: new Set<string>(),
        notices: new Set<string>(),
      };
      existingObs.minutes += ev.duracionMinutos;
      existingObs.count += 1;
      if (ev.maquina && ev.maquina !== 'Sin máquina') existingObs.machines.add(ev.maquina);
      if (ev.fechaSap) existingObs.dates.add(ev.fechaSap.split(' ')[0]);
      if (ev.numeroAvisoSap && ev.numeroAvisoSap !== '—') existingObs.notices.add(ev.numeroAvisoSap);
      current.observationsMap.set(obsKey, existingObs);
    }

    map.set(normKey, current);
  }

  const safePeriodDays = Math.max(1, periodUniqueDays);
  const list = Array.from(map.values()).map((stats) => {
    const topObservations: DimensionObservation[] = Array.from(stats.observationsMap.values())
      .map((o) => ({
        text: o.text,
        minutes: Math.round(o.minutes * 10) / 10,
        count: o.count,
        machines: Array.from(o.machines),
        dates: Array.from(o.dates),
        notices: Array.from(o.notices),
      }))
      .sort((a, b) => b.minutes - a.minutes || b.count - a.count);

    return {
      name: stats.displayName,
      minutes: Math.round(stats.minutes * 10) / 10,
      vacioMinutes: Math.round(stats.vacioMinutes * 10) / 10,
      paradaMinutes: Math.round(stats.paradaMinutes * 10) / 10,
      count: stats.count,
      vacioCount: stats.vacioCount,
      paradaCount: stats.paradaCount,
      sharePercent: totalMinutes > 0 ? (stats.minutes / totalMinutes) * 100 : 0,
      cumulativePercent: 0,
      avgMinutes: stats.count > 0 ? stats.minutes / stats.count : 0,
      avgDailyMinutes: Math.round((stats.minutes / safePeriodDays) * 10) / 10,
      activeDaysCount: stats.datesSet.size,
      sampleNotice: stats.sampleNotice,
      sampleObservation: topObservations[0]?.text,
      topObservations,
    };
  });

  list.sort((a, b) =>
    sortBy === 'minutes' ? b.minutes - a.minutes || b.count - a.count : b.count - a.count || b.minutes - a.minutes
  );

  let cumulative = 0;
  for (const item of list) {
    cumulative += item.sharePercent;
    item.cumulativePercent = Math.min(100, cumulative);
  }

  return list;
}

export function computeDowntimeAnalytics(events: DowntimeEvent[]): DowntimeAnalytics {
  const totalEvents = events.length;
  let totalMinutes = 0;
  let vacioEvents = 0;
  let vacioMinutes = 0;
  let paradaEvents = 0;
  let paradaMinutes = 0;

  const periodDateKeys = new Set<string>();
  for (const ev of events) {
    totalMinutes += ev.duracionMinutos;
    if (ev.fechaIso) periodDateKeys.add(ev.fechaIso);
    if (ev.isVacio) {
      vacioEvents += 1;
      vacioMinutes += ev.duracionMinutos;
    } else {
      paradaEvents += 1;
      paradaMinutes += ev.duracionMinutos;
    }
  }

  const uniqueDaysCount =
    periodDateKeys.size > 0 ? periodDateKeys.size : events.length > 0 ? 1 : 0;
  const periodDaysDenominator = Math.max(1, uniqueDaysCount);

  const byGrupo = buildDimensionBreakdown(events, (e) => e.grupo, totalMinutes, 'minutes', periodDaysDenominator);
  const byGrupoCount = buildDimensionBreakdown(events, (e) => e.grupo, totalMinutes, 'count', periodDaysDenominator);
  const byMotivo = buildDimensionBreakdown(events, (e) => e.motivo, totalMinutes, 'minutes', periodDaysDenominator);
  const byMotivoCount = buildDimensionBreakdown(events, (e) => e.motivo, totalMinutes, 'count', periodDaysDenominator);
  const paradaEventsList = events.filter((e) => !e.isVacio);
  const vacioEventsList = events.filter((e) => e.isVacio);
  const topParadaMotivo =
    buildDimensionBreakdown(paradaEventsList, (e) => e.motivo, paradaMinutes, 'minutes', periodDaysDenominator)[0] ?? null;
  const topVacioMotivo =
    buildDimensionBreakdown(vacioEventsList, (e) => e.motivo, vacioMinutes, 'minutes', periodDaysDenominator)[0] ?? null;
  const byMaquina = buildDimensionBreakdown(events, (e) => e.maquina, totalMinutes, 'minutes', periodDaysDenominator);
  const byMaquinaCount = buildDimensionBreakdown(events, (e) => e.maquina, totalMinutes, 'count', periodDaysDenominator);
  const byProceso = buildDimensionBreakdown(events, (e) => e.proceso, totalMinutes, 'minutes', periodDaysDenominator);
  const bySector = buildDimensionBreakdown(events, (e) => e.centro, totalMinutes, 'minutes', periodDaysDenominator);
  const byTurno = buildDimensionBreakdown(events, (e) => e.turno, totalMinutes, 'minutes', periodDaysDenominator);
  const byProducto = buildDimensionBreakdown(events, (e) => e.producto, totalMinutes, 'minutes', periodDaysDenominator);

  // Daily Timeline
  const dailyMap = new Map<string, DailyMetric>();
  for (const ev of events) {
    const dateKey = ev.fechaIso ?? 'Sin fecha';
    const current = dailyMap.get(dateKey) ?? {
      date: dateKey,
      label: dateKey === 'Sin fecha' ? 'Sin fecha' : formatShortDateLabel(dateKey),
      totalMinutes: 0,
      vacioMinutes: 0,
      paradaMinutes: 0,
      totalCount: 0,
      vacioCount: 0,
      paradaCount: 0,
    };

    current.totalMinutes += ev.duracionMinutos;
    current.totalCount += 1;
    if (ev.isVacio) {
      current.vacioMinutes += ev.duracionMinutos;
      current.vacioCount += 1;
    } else {
      current.paradaMinutes += ev.duracionMinutos;
      current.paradaCount += 1;
    }

    dailyMap.set(dateKey, current);
  }

  const dailyTimeline = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const datedDays = dailyTimeline.filter((d) => d.date !== 'Sin fecha');
  const dayPool = datedDays.length > 0 ? datedDays : dailyTimeline;

  const peakDateByMinutes =
    dayPool.length > 0
      ? [...dayPool].sort((a, b) => b.totalMinutes - a.totalMinutes)[0]
      : null;

  const peakDateByCount =
    dayPool.length > 0
      ? [...dayPool].sort((a, b) => b.totalCount - a.totalCount || b.totalMinutes - a.totalMinutes)[0]
      : null;

  const peakVacioDate =
    dayPool.some((d) => d.vacioMinutes > 0)
      ? [...dayPool].sort((a, b) => b.vacioMinutes - a.vacioMinutes)[0]
      : null;

  // Month-vs-Month comparison
  const monthMap = new Map<string, DowntimeEvent[]>();
  for (const ev of events) {
    if (!ev.monthKey) continue;
    const list = monthMap.get(ev.monthKey) ?? [];
    list.push(ev);
    monthMap.set(ev.monthKey, list);
  }

  const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => a.localeCompare(b));
  const monthlyComparison: MonthlyComparisonRow[] = sortedMonthKeys.map((monthKey, idx) => {
    const monthEvents = monthMap.get(monthKey) ?? [];
    const mTotal = monthEvents.reduce((acc, e) => acc + e.duracionMinutos, 0);
    const mVacio = monthEvents.filter((e) => e.isVacio).reduce((acc, e) => acc + e.duracionMinutos, 0);
    const mParada = mTotal - mVacio;
    const mVacioCount = monthEvents.filter((e) => e.isVacio).length;
    const mParadaCount = monthEvents.length - mVacioCount;

    const topG = buildDimensionBreakdown(monthEvents, (e) => e.grupo, mTotal, 'minutes')[0]?.name ?? '—';
    const topM = buildDimensionBreakdown(monthEvents, (e) => e.motivo, mTotal, 'minutes')[0]?.name ?? '—';
    const topEq = buildDimensionBreakdown(monthEvents, (e) => e.maquina, mTotal, 'minutes')[0]?.name ?? '—';

    let deltaMinutesPercent: number | null = null;
    if (idx > 0) {
      const prevEvents = monthMap.get(sortedMonthKeys[idx - 1]) ?? [];
      const prevTotal = prevEvents.reduce((acc, e) => acc + e.duracionMinutos, 0);
      if (prevTotal > 0) {
        deltaMinutesPercent = ((mTotal - prevTotal) / prevTotal) * 100;
      }
    }

    return {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      totalMinutes: Math.round(mTotal),
      vacioMinutes: Math.round(mVacio),
      paradaMinutes: Math.round(mParada),
      totalCount: monthEvents.length,
      vacioCount: mVacioCount,
      paradaCount: mParadaCount,
      topGrupo: topG,
      topMotivo: topM,
      topMaquina: topEq,
      deltaMinutesPercent,
    };
  });

  return {
    totalEvents,
    totalMinutes: Math.round(totalMinutes),
    vacioEvents,
    vacioMinutes: Math.round(vacioMinutes),
    vacioSharePercent: totalMinutes > 0 ? (vacioMinutes / totalMinutes) * 100 : 0,
    paradaEvents,
    paradaMinutes: Math.round(paradaMinutes),
    paradaSharePercent: totalMinutes > 0 ? (paradaMinutes / totalMinutes) * 100 : 0,
    avgDurationMinutes: totalEvents > 0 ? totalMinutes / totalEvents : 0,
    uniqueDaysCount,

    topGrupoByMinutes: byGrupo[0] ?? null,
    topGrupoByCount: byGrupoCount[0] ?? null,
    topMotivoByMinutes: byMotivo[0] ?? null,
    topMotivoByCount: byMotivoCount[0] ?? null,
    topParadaMotivo,
    topVacioMotivo,
    topMaquinaByMinutes: byMaquina[0] ?? null,
    topMaquinaByCount: byMaquinaCount[0] ?? null,
    topProcesoByMinutes: byProceso[0] ?? null,
    topSectorByMinutes: bySector[0] ?? null,
    peakDateByMinutes,
    peakDateByCount,
    peakVacioDate,

    byGrupo,
    byMotivo,
    byMaquina,
    byProceso,
    bySector,
    byTurno,
    byProducto,
    dailyTimeline,
    monthlyComparison,
  };
}
