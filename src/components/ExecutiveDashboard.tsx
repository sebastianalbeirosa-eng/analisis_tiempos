import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Download,
  Filter,
  Flame,
  Gauge,
  Layers,
  MapPin,
  MessageSquareText,
  Search,
  Tag,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DimensionBreakdown, DowntimeAnalytics } from '../types/csv';
import { formatMinutesAsHours } from '../utils/downtimeAnalytics';

type EventTypeFilter = 'all' | 'vacios' | 'paradas';
type MotivoSortKey =
  | 'minutes'
  | 'paradaMinutes'
  | 'vacioMinutes'
  | 'count'
  | 'avgDailyMinutes'
  | 'name';

interface ExecutiveDashboardProps {
  analytics: DowntimeAnalytics;
  unitOptions: string[];
  selectedUnit: string;
  onSelectUnit: (unit: string) => void;
  selectedGroup?: string;
  onSelectGroup?: (groupName: string) => void;
  selectedMachine?: string;
  onSelectMachine?: (machineName: string) => void;
  selectedMotivo?: string;
  onSelectMotivo?: (motivoName: string) => void;
  selectedSector?: string;
  typeFilter: EventTypeFilter;
  onChangeTypeFilter: (type: EventTypeFilter) => void;
  onResetFilters?: () => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  analytics,
  unitOptions,
  selectedUnit,
  onSelectUnit,
  selectedGroup = 'all',
  onSelectGroup,
  selectedMachine = 'all',
  onSelectMachine,
  selectedMotivo = 'all',
  onSelectMotivo,
  selectedSector = 'all',
  typeFilter,
  onChangeTypeFilter,
  onResetFilters,
}) => {
  const [rankingTab, setRankingTab] = useState<
    'maquina' | 'grupo' | 'producto' | 'proceso' | 'sector' | 'turno' | 'motivo'
  >('maquina');
  const [motivoSearch, setMotivoSearch] = useState<string>('');
  const [sortKey, setSortKey] = useState<MotivoSortKey>('minutes');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [paretoMode, setParetoMode] = useState<'minutes' | 'frequency'>('minutes');
  const [paretoLimit, setParetoLimit] = useState<10 | 15 | 'all'>(15);
  const [dailyAvgScope, setDailyAvgScope] = useState<'all' | 'paradas' | 'vacios'>('all');
  const [expandedMotivos, setExpandedMotivos] = useState<Record<string, boolean>>({});
  const [expandAllObservations, setExpandAllObservations] = useState<boolean>(false);

  const maxDailyMinutes = Math.max(
    1,
    ...analytics.dailyTimeline.map((d) => d.totalMinutes)
  );

  const quickSelectorMode: 'unit' | 'group' | 'sector' =
    unitOptions.length > 0
      ? 'unit'
      : analytics.byGrupo.length > 1
        ? 'group'
        : 'sector';

  const quickSelectorItems: string[] = useMemo(() => {
    if (unitOptions.length > 0) return unitOptions;
    if (analytics.byGrupo.length > 0) return analytics.byGrupo.map((g) => g.name);
    return analytics.bySector.map((s) => s.name);
  }, [unitOptions, analytics.byGrupo, analytics.bySector]);

  const activeScopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedUnit && selectedUnit !== 'all') parts.push(`Unidad ${selectedUnit}`);
    if (selectedSector && selectedSector !== 'all') parts.push(`Sector ${selectedSector}`);
    if (selectedGroup && selectedGroup !== 'all') parts.push(`Grupo ${selectedGroup}`);
    if (selectedMachine && selectedMachine !== 'all') parts.push(`Máquina ${selectedMachine}`);
    if (selectedMotivo && selectedMotivo !== 'all') parts.push(`Motivo ${selectedMotivo}`);
    return parts.length > 0 ? parts.join(' · ') : 'Toda la Planta';
  }, [selectedUnit, selectedSector, selectedGroup, selectedMachine, selectedMotivo]);

  const filteredAndSortedMotivos = useMemo(() => {
    const q = motivoSearch.trim().toLowerCase();
    const filtered = analytics.byMotivo.filter((m) => {
      if (!q) return true;
      return m.name.toLowerCase().includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        const cmp = a.name.localeCompare(b.name, 'es');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const valA = a[sortKey];
      const valB = b[sortKey];
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [analytics.byMotivo, motivoSearch, sortKey, sortDir]);

  const motivoTableTotals = useMemo(() => {
    return filteredAndSortedMotivos.reduce(
      (acc, item) => {
        acc.count += item.count;
        acc.vacioCount += item.vacioCount;
        acc.paradaCount += item.paradaCount;
        acc.paradaMinutes += item.paradaMinutes;
        acc.vacioMinutes += item.vacioMinutes;
        acc.minutes += item.minutes;
        acc.sharePercent += item.sharePercent;
        return acc;
      },
      {
        count: 0,
        vacioCount: 0,
        paradaCount: 0,
        paradaMinutes: 0,
        vacioMinutes: 0,
        minutes: 0,
        sharePercent: 0,
      }
    );
  }, [filteredAndSortedMotivos]);

  const handleToggleSort = (key: MotivoSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (key: MotivoSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 text-slate-400" aria-hidden="true" />;
    }
    return sortDir === 'desc' ? (
      <ArrowDown className="h-3 w-3 text-blue-700" aria-hidden="true" />
    ) : (
      <ArrowUp className="h-3 w-3 text-blue-700" aria-hidden="true" />
    );
  };

  const handleExportMotivosCsv = () => {
    if (filteredAndSortedMotivos.length === 0) return;
    const headers = [
      'FILTRO ACTIVO',
      'MOTIVO',
      'CLASIFICACION',
      'EVENTOS',
      'EVENTOS VACIO',
      'EVENTOS PARADA',
      'MINUTOS PARADA',
      'MINUTOS VACIO (QUEMADO)',
      'TOTAL MINUTOS',
      'HORAS FORMATEADAS',
      'PROMEDIO DIARIO (MIN/DIA)',
      'PORCENTAJE DEL TOTAL (%)',
      'OBSERVACION PRINCIPAL SAP',
      'TODAS LAS OBSERVACIONES SAP',
    ];
    const rows = filteredAndSortedMotivos.map((item) => {
      const clasif =
        item.vacioMinutes > 0 && item.paradaMinutes > 0
          ? 'Vacío + Parada'
          : item.vacioMinutes > 0
            ? 'Vacío de Horno (Quemado)'
            : 'Parada';
      const allObsJoined = (item.topObservations ?? [])
        .map((o) => `${o.text} [${o.minutes}m / ${o.count}ev]`)
        .join(' | ');
      return [
        `"${activeScopeLabel.replace(/"/g, '""')}"`,
        `"${item.name.replace(/"/g, '""')}"`,
        clasif,
        item.count,
        item.vacioCount,
        item.paradaCount,
        item.paradaMinutes,
        item.vacioMinutes,
        item.minutes,
        formatMinutesAsHours(item.minutes),
        item.avgDailyMinutes,
        item.sharePercent.toFixed(1),
        `"${(item.sampleObservation || '').replace(/"/g, '""')}"`,
        `"${allObsJoined.replace(/"/g, '""')}"`,
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = (selectedUnit !== 'all' ? selectedUnit : 'planta')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    link.href = url;
    link.setAttribute(
      'download',
      `motivos_paradas_vacios_${slug}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const activeRankingList: DimensionBreakdown[] =
    rankingTab === 'motivo'
      ? analytics.byMotivo
      : rankingTab === 'maquina'
        ? analytics.byMaquina
        : rankingTab === 'grupo'
          ? analytics.byGrupo
          : rankingTab === 'proceso'
            ? analytics.byProceso
            : rankingTab === 'sector'
              ? analytics.bySector
              : rankingTab === 'turno'
                ? analytics.byTurno
                : analytics.byProducto;

  const totalHours = (analytics.totalMinutes / 60).toFixed(1);
  const avgDuration = analytics.avgDurationMinutes.toFixed(1);

  const monthlyChartData = analytics.monthlyComparison.map((m) => ({
    name: m.monthLabel,
    vaciosHoras: Number((m.vacioMinutes / 60).toFixed(1)),
    paradasHoras: Number((m.paradaMinutes / 60).toFixed(1)),
    totalHoras: Number((m.totalMinutes / 60).toFixed(1)),
    eventos: m.totalCount,
  }));

  const topMotivosBarData = analytics.byMotivo.slice(0, 10).map((m) => ({
    name: m.name.length > 28 ? `${m.name.slice(0, 26)}...` : m.name,
    fullName: m.name,
    minutos: Math.round(m.minutes),
    vacios: Math.round(m.vacioMinutes),
    paradas: Math.round(m.paradaMinutes),
    promedioDiario: m.avgDailyMinutes,
  }));

  const paretoAnalysis = useMemo(() => {
    const source = analytics.byMotivo;
    if (source.length === 0) {
      return {
        chartRows: [] as Array<{
          shortName: string;
          fullName: string;
          value: number;
          minutes: number;
          vacioMinutes: number;
          paradaMinutes: number;
          count: number;
          sharePercent: number;
          cumulativePercent: number;
          cumulativeMinutesPercent: number;
          isVital80: boolean;
          sampleObservation?: string;
        }>,
        vitalRows: [] as Array<{
          shortName: string;
          fullName: string;
          value: number;
          minutes: number;
          vacioMinutes: number;
          paradaMinutes: number;
          count: number;
          sharePercent: number;
          cumulativePercent: number;
          cumulativeMinutesPercent: number;
          isVital80: boolean;
          sampleObservation?: string;
        }>,
        totalMotivos: 0,
        vitalCount: 0,
        vitalCausePercent: 0,
        vitalImpactPercent: 0,
        vitalMinutes: 0,
        vitalEvents: 0,
      };
    }

    const sorted =
      paretoMode === 'minutes'
        ? [...source].sort((a, b) => b.minutes - a.minutes)
        : [...source].sort((a, b) => b.count - a.count || b.minutes - a.minutes);

    const totalMetric = sorted.reduce(
      (acc, m) => acc + (paretoMode === 'minutes' ? m.minutes : m.count),
      0
    );
    const totalMinutesAll = sorted.reduce((acc, m) => acc + m.minutes, 0);

    let runningMetric = 0;
    let runningMinutes = 0;
    let crossed80 = false;

    const allComputed = sorted.map((m) => {
      const val = paretoMode === 'minutes' ? m.minutes : m.count;
      runningMetric += val;
      runningMinutes += m.minutes;
      const cumPct = totalMetric > 0 ? (runningMetric / totalMetric) * 100 : 0;
      const cumMinPct = totalMinutesAll > 0 ? (runningMinutes / totalMinutesAll) * 100 : 0;
      const sharePct = totalMetric > 0 ? (val / totalMetric) * 100 : 0;

      // Include the cause that crosses the 80% threshold as part of the vital few
      const isVital80 = !crossed80;
      if (cumPct >= 80) {
        crossed80 = true;
      }

      const shortName = m.name.length > 18 ? `${m.name.slice(0, 16)}…` : m.name;

      return {
        shortName,
        fullName: m.name,
        value: paretoMode === 'minutes' ? Math.round(m.minutes) : m.count,
        minutes: Math.round(m.minutes),
        vacioMinutes: Math.round(m.vacioMinutes),
        paradaMinutes: Math.round(m.paradaMinutes),
        count: m.count,
        sharePercent: Number(sharePct.toFixed(1)),
        cumulativePercent: Number(Math.min(100, cumPct).toFixed(1)),
        cumulativeMinutesPercent: Number(Math.min(100, cumMinPct).toFixed(1)),
        isVital80,
        sampleObservation: m.sampleObservation,
      };
    });

    const vitalRows = allComputed.filter((r) => r.isVital80);
    const vitalMinutes = vitalRows.reduce((acc, r) => acc + r.minutes, 0);
    const vitalEvents = vitalRows.reduce((acc, r) => acc + r.count, 0);
    const vitalImpactPercent =
      vitalRows.length > 0 ? vitalRows[vitalRows.length - 1].cumulativePercent : 0;
    const vitalCausePercent =
      allComputed.length > 0 ? (vitalRows.length / allComputed.length) * 100 : 0;

    const chartRows =
      paretoLimit === 'all' ? allComputed : allComputed.slice(0, paretoLimit);

    return {
      chartRows,
      vitalRows,
      totalMotivos: allComputed.length,
      vitalCount: vitalRows.length,
      vitalCausePercent,
      vitalImpactPercent,
      vitalMinutes,
      vitalEvents,
    };
  }, [analytics.byMotivo, paretoMode, paretoLimit]);

  const dailyAveragesData = useMemo(() => {
    const uniqueDays = Math.max(1, analytics.uniqueDaysCount || 0);
    const items = analytics.byMotivo
      .filter((m) => {
        if (dailyAvgScope === 'paradas') return m.paradaMinutes > 0;
        if (dailyAvgScope === 'vacios') return m.vacioMinutes > 0;
        return m.minutes > 0;
      })
      .map((m) => {
        const scopedMinutes =
          dailyAvgScope === 'paradas'
            ? m.paradaMinutes
            : dailyAvgScope === 'vacios'
              ? m.vacioMinutes
              : m.minutes;
        const scopedCount =
          dailyAvgScope === 'paradas'
            ? m.paradaCount
            : dailyAvgScope === 'vacios'
              ? m.vacioCount
              : m.count;
        const avgPerUniqueDay = Math.round((scopedMinutes / uniqueDays) * 10) / 10;
        const paradaDaily = Math.round((m.paradaMinutes / uniqueDays) * 10) / 10;
        const vacioDaily = Math.round((m.vacioMinutes / uniqueDays) * 10) / 10;

        return {
          name: m.name,
          scopedMinutes: Math.round(scopedMinutes * 10) / 10,
          scopedCount,
          avgPerUniqueDay,
          paradaDaily,
          vacioDaily,
          activeDaysCount: m.activeDaysCount ?? 0,
          sampleObservation: m.sampleObservation,
          hasVacio: m.vacioMinutes > 0,
          hasParada: m.paradaMinutes > 0,
        };
      })
      .sort((a, b) => b.avgPerUniqueDay - a.avgPerUniqueDay || b.scopedCount - a.scopedCount);

    const maxAvgDaily = Math.max(1, ...items.map((i) => i.avgPerUniqueDay));
    const totalScopedMinutes = items.reduce((acc, i) => acc + i.scopedMinutes, 0);
    const totalScopedAvgDaily = Math.round((totalScopedMinutes / uniqueDays) * 10) / 10;
    const totalVacioDaily = Math.round((analytics.vacioMinutes / uniqueDays) * 10) / 10;
    const totalParadaDaily = Math.round((analytics.paradaMinutes / uniqueDays) * 10) / 10;

    return {
      uniqueDaysCount: analytics.uniqueDaysCount,
      items,
      maxAvgDaily,
      totalScopedMinutes: Math.round(totalScopedMinutes * 10) / 10,
      totalScopedAvgDaily,
      totalVacioDaily,
      totalParadaDaily,
    };
  }, [analytics.byMotivo, analytics.uniqueDaysCount, analytics.vacioMinutes, analytics.paradaMinutes, dailyAvgScope]);

  const estimatedTotalDays = Math.max(1, analytics.dailyTimeline.length);
  const totalPlannedMinutesPerMachine = estimatedTotalDays * 24 * 60;

  const machineOEEList = analytics.byMaquina.map((mac) => {
    const planned = totalPlannedMinutesPerMachine;
    const downtime = mac.minutes;
    const availability = Math.max(0, Math.min(1, (planned - downtime) / planned));
    const performance = 0.94;
    const quality = 0.96;
    const oee = availability * performance * quality * 100;

    return {
      name: mac.name,
      count: mac.count,
      downtimeMin: downtime,
      vacioMin: mac.vacioMinutes,
      paradaMin: mac.paradaMinutes,
      availabilityPercent: Number((availability * 100).toFixed(1)),
      performancePercent: Number((performance * 100).toFixed(1)),
      qualityPercent: Number((quality * 100).toFixed(1)),
      oeePercent: Number(oee.toFixed(1)),
    };
  });

  return (
    <div className="space-y-6">
      {/* Unified Hero KPI Strip + Vacíos/Paradas Proportion Bar */}
      <section
        aria-label="Indicadores ejecutivos de tiempo muerto"
        className="rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Inactividad Total</span>
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                {totalHours} h
              </p>
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
              {analytics.totalMinutes.toLocaleString('es-AR')} min · {analytics.totalEvents.toLocaleString('es-AR')} eventos
            </p>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-amber-800">
                <span>Vacíos de Horno (Quemado)</span>
                <Flame className="h-4 w-4 text-amber-600" aria-hidden="true" />
              </div>
              <p className="mt-2.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-amber-700">
                {analytics.vacioMinutes.toLocaleString('es-AR')} m
              </p>
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
              {formatMinutesAsHours(analytics.vacioMinutes)} · {analytics.vacioSharePercent.toFixed(1)}% ({analytics.vacioEvents} ev.)
            </p>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-blue-800">
                <span>Paradas (Prensa / Esmalte)</span>
                <Activity className="h-4 w-4 text-blue-700" aria-hidden="true" />
              </div>
              <p className="mt-2.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-blue-800">
                {analytics.paradaMinutes.toLocaleString('es-AR')} m
              </p>
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
              {formatMinutesAsHours(analytics.paradaMinutes)} · {analytics.paradaSharePercent.toFixed(1)}% ({analytics.paradaEvents} ev.)
            </p>
          </div>

          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Promedio por Evento</span>
                <Layers className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                {avgDuration} m
              </p>
            </div>
            <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
              {analytics.byMotivo.length} motivos · {analytics.byMaquina.length} máquinas · {analytics.bySector.length} sectores
            </p>
          </div>
        </div>

        {/* Visual Proportion Bar */}
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
            Balance operativo ({activeScopeLabel})
          </span>
          <div className="flex-1 h-2 rounded-xs bg-slate-200 overflow-hidden flex">
            {analytics.vacioSharePercent > 0 && (
              <div
                style={{ width: `${analytics.vacioSharePercent}%` }}
                className="h-full bg-amber-500 transition-all duration-200"
                title={`Vacíos: ${analytics.vacioSharePercent.toFixed(1)}%`}
              />
            )}
            {analytics.paradaSharePercent > 0 && (
              <div
                style={{ width: `${analytics.paradaSharePercent}%` }}
                className="h-full bg-blue-700 transition-all duration-200"
                title={`Paradas: ${analytics.paradaSharePercent.toFixed(1)}%`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-xs bg-amber-500" aria-hidden="true" />
              Vacíos {analytics.vacioSharePercent.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-xs bg-blue-700" aria-hidden="true" />
              Paradas {analytics.paradaSharePercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </section>

      {/* Focused Observations Panel when a Motivo / Código is selected in the Global Filter */}
      {selectedMotivo && selectedMotivo !== 'all' && (
        <section
          aria-label="Observaciones SAP del motivo seleccionado"
          className="rounded-lg border border-blue-200 bg-white overflow-hidden print-break-inside-avoid"
        >
          {(() => {
            const matchedMotivo =
              analytics.byMotivo.find(
                (m) => m.name.toLowerCase() === selectedMotivo.toLowerCase()
              ) ?? analytics.byMotivo[0];
            const obsList = matchedMotivo?.topObservations ?? [];
            const totalMin = matchedMotivo?.minutes ?? analytics.totalMinutes;
            const totalEv = matchedMotivo?.count ?? analytics.totalEvents;
            const avgDay = matchedMotivo?.avgDailyMinutes ?? 0;

            return (
              <>
                <div className="border-b border-slate-200 bg-blue-50/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-blue-700" aria-hidden="true" />
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Observaciones del Motivo: {matchedMotivo?.name ?? selectedMotivo}
                      </h2>
                    </div>
                    <p className="mt-1 font-mono text-xs tabular-nums text-slate-600">
                      <strong className="text-slate-900">
                        {Math.round(totalMin).toLocaleString('es-AR')} min (
                        {formatMinutesAsHours(totalMin)})
                      </strong>{' '}
                      <span className="text-slate-300">·</span>{' '}
                      <span>{totalEv} eventos</span>{' '}
                      <span className="text-slate-300">·</span>{' '}
                      <span className="text-blue-700 font-semibold">{avgDay} min/día</span>{' '}
                      <span className="text-slate-300">·</span>{' '}
                      <span>
                        {obsList.length}{' '}
                        {obsList.length === 1
                          ? 'observación SAP registrada'
                          : 'observaciones SAP distintas'}
                      </span>
                    </p>
                  </div>

                  {onSelectMotivo && (
                    <button
                      type="button"
                      onClick={() => onSelectMotivo(selectedMotivo)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 no-print"
                    >
                      Quitar filtro de motivo
                    </button>
                  )}
                </div>

                {obsList.length === 0 ? (
                  <div className="px-5 py-6 text-xs text-slate-500">
                    Los avisos SAP filtrados para este motivo no contienen texto en el campo de observaciones.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 pl-5 pr-2 font-medium w-10">#</th>
                          <th className="py-2.5 px-3 font-medium">Observación SAP</th>
                          <th className="py-2.5 px-3 font-medium">Máquinas / Equipos</th>
                          <th className="py-2.5 px-3 font-medium">Fechas y Avisos SAP</th>
                          <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                            Eventos
                          </th>
                          <th className="py-2.5 pl-3 pr-5 font-medium text-right whitespace-nowrap">
                            Minutos
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {obsList.map((obs, idx) => (
                          <tr key={`focused-obs-${idx}`} className="hover:bg-slate-50/70">
                            <td className="py-2.5 pl-5 pr-2 font-mono tabular-nums text-slate-400 align-top">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 text-slate-900 min-w-[260px] max-w-[460px] leading-snug align-top">
                              {obs.text}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 align-top">
                              {obs.machines && obs.machines.length > 0
                                ? obs.machines.join(', ')
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] tabular-nums text-slate-500 align-top">
                              {obs.dates && obs.dates.length > 0 && (
                                <div>
                                  {obs.dates.slice(0, 4).join(', ')}
                                  {obs.dates.length > 4 ? ` (+${obs.dates.length - 4})` : ''}
                                </div>
                              )}
                              {obs.notices && obs.notices.length > 0 && (
                                <div className="text-slate-400">
                                  Aviso: {obs.notices.slice(0, 3).join(', ')}
                                  {obs.notices.length > 3 ? ` (+${obs.notices.length - 3})` : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap align-top">
                              {obs.count}
                            </td>
                            <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap align-top">
                              <span className="font-semibold text-slate-900">
                                {Math.round(obs.minutes).toLocaleString('es-AR')} min
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                {formatMinutesAsHours(obs.minutes)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}

      {/* Pareto 80/20 Chart Section */}
      <section
        aria-label="Gráfico de Pareto 80/20 de motivos de parada y vacíos"
        className="rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid"
      >
        <div className="border-b border-slate-200 px-5 py-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Gráfico de Pareto (Regla 80/20) · {activeScopeLabel}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Identifica los motivos vitales que concentran el 80% de las pérdidas acumuladas en minutos y frecuencia
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setParetoMode('minutes')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    paretoMode === 'minutes'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Minutos
                </button>
                <button
                  type="button"
                  onClick={() => setParetoMode('frequency')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    paretoMode === 'frequency'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Frecuencia
                </button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { id: 10, label: 'Top 10' },
                    { id: 15, label: 'Top 15' },
                    { id: 'all', label: 'Todos' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => setParetoLimit(opt.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      paretoLimit === opt.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {paretoAnalysis.totalMotivos > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs font-mono tabular-nums text-slate-600">
              <span>
                Causas vitales (80%):{' '}
                <strong className="text-blue-700">
                  {paretoAnalysis.vitalCount} de {paretoAnalysis.totalMotivos} motivos (
                  {paretoAnalysis.vitalCausePercent.toFixed(1)}%)
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>
                Impacto cubierto:{' '}
                <strong className="text-slate-900">
                  {paretoAnalysis.vitalImpactPercent.toFixed(1)}%
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>
                Minutos vitales:{' '}
                <strong className="text-slate-900">
                  {paretoAnalysis.vitalMinutes.toLocaleString('es-AR')} min (
                  {formatMinutesAsHours(paretoAnalysis.vitalMinutes)})
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>
                Frecuencia vital:{' '}
                <strong className="text-slate-900">
                  {paretoAnalysis.vitalEvents} eventos
                </strong>
              </span>
            </div>
          )}
        </div>

        {paretoAnalysis.chartRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-slate-500">
            Sin motivos disponibles para construir el gráfico de Pareto en el filtro actual.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left: Recharts Pareto Combo Chart */}
            <div className="lg:col-span-8 p-5">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={paretoAnalysis.chartRows}
                    margin={{ top: 16, right: 16, left: 0, bottom: 28 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 10, fill: '#475569' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      interval={0}
                      angle={-24}
                      textAnchor="end"
                      height={58}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      unit={paretoMode === 'minutes' ? 'm' : ' ev'}
                      width={58}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#dc2626' }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                      width={44}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0]?.payload as
                          | (typeof paretoAnalysis.chartRows)[number]
                          | undefined;
                        if (!row) return null;
                        return (
                          <div className="rounded-md border border-slate-200 bg-slate-900 px-3 py-2.5 text-xs text-slate-50 shadow-md max-w-[280px]">
                            <p className="font-semibold text-white leading-snug">
                              {row.fullName}
                            </p>
                            <div className="mt-1.5 space-y-1 font-mono tabular-nums text-[11px]">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300">Duración total:</span>
                                <span className="font-semibold text-white">
                                  {row.minutes.toLocaleString('es-AR')} min ({formatMinutesAsHours(row.minutes)})
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300">Frecuencia:</span>
                                <span>{row.count} eventos</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-300">Paradas / Vacíos:</span>
                                <span>
                                  {row.paradaMinutes}m P · {row.vacioMinutes}m V
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-700 pt-1">
                                <span className="text-slate-300">% Individual / Acum.:</span>
                                <span className="font-semibold text-amber-300">
                                  {row.sharePercent}% · {row.cumulativePercent}% acum.
                                </span>
                              </div>
                              {paretoMode === 'frequency' && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-300">Acum. en minutos:</span>
                                  <span>{row.cumulativeMinutesPercent}%</span>
                                </div>
                              )}
                              <div className="pt-0.5 text-slate-300">
                                {row.isVital80
                                  ? 'Zona vital (dentro del 80% de pérdidas)'
                                  : 'Zona secundaria (20% restante)'}
                              </div>
                              {row.sampleObservation && (
                                <div className="border-t border-slate-700 pt-1.5 font-sans text-[11px] text-slate-200 leading-snug">
                                  <span className="text-slate-400">Obs. SAP: </span>
                                  {row.sampleObservation}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    <ReferenceLine
                      yAxisId="right"
                      y={80}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Corte 80%',
                        position: 'insideTopRight',
                        fill: '#dc2626',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="value"
                      name={paretoMode === 'minutes' ? 'Minutos (Zona 80% en azul / resto gris)' : 'Eventos (Frecuencia)'}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                    >
                      {paretoAnalysis.chartRows.map((entry, idx) => (
                        <Cell
                          key={`pareto-bar-${idx}`}
                          fill={
                            entry.isVital80
                              ? entry.vacioMinutes > entry.paradaMinutes
                                ? '#d97706'
                                : '#1d4ed8'
                              : '#cbd5e1'
                          }
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulativePercent"
                      name="% Acumulado"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#dc2626', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Vital Few (80%) Actionable List */}
            <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col">
              <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">
                    Causas Vitales que Explican el 80% ({paretoAnalysis.vitalRows.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Clic en un motivo para filtrarlo en la tabla inferior
                  </p>
                </div>
                {motivoSearch && (
                  <button
                    type="button"
                    onClick={() => setMotivoSearch('')}
                    className="text-[11px] font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    Ver todos
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto max-h-80 flex-1">
                {paretoAnalysis.vitalRows.map((row, idx) => {
                  const isFiltered =
                    motivoSearch.trim().toLowerCase() === row.fullName.toLowerCase();
                  return (
                    <button
                      key={row.fullName}
                      type="button"
                      onClick={() =>
                        setMotivoSearch(isFiltered ? '' : row.fullName)
                      }
                      className={`w-full text-left px-5 py-2.5 transition-colors hover:bg-slate-50 flex items-start justify-between gap-3 ${
                        isFiltered ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 text-xs">
                          <span className="font-mono text-slate-400 tabular-nums">
                            {idx + 1}.
                          </span>
                          <span className="font-medium text-slate-900 truncate" title={row.fullName}>
                            {row.fullName}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                          {row.minutes.toLocaleString('es-AR')} min · {row.count} ev ·{' '}
                          {row.sharePercent}% indiv.
                        </p>
                        {row.sampleObservation && (
                          <p
                            className="mt-1 text-[11px] text-slate-600 line-clamp-2 leading-snug"
                            title={row.sampleObservation}
                          >
                            Obs.: {row.sampleObservation}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-red-700 whitespace-nowrap shrink-0">
                        {row.cumulativePercent}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {(analytics.topParadaMotivo || analytics.topVacioMotivo) && (
          <div className="border-t border-slate-200 bg-slate-50/50 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="px-5 py-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-800">
                  Motivo Preponderante de Paradas
                </span>
                {analytics.topParadaMotivo && (
                  <span className="font-mono tabular-nums text-slate-600">
                    {analytics.topParadaMotivo.minutes.toLocaleString('es-AR')} min ·{' '}
                    {analytics.topParadaMotivo.count} ev ({analytics.topParadaMotivo.sharePercent.toFixed(1)}%)
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900">
                {analytics.topParadaMotivo?.name ?? 'Sin paradas registradas en el filtro'}
              </p>
              {analytics.topParadaMotivo && (
                <p className="text-xs text-slate-600 leading-snug">
                  <span className="font-medium text-slate-700">Observación SAP: </span>
                  {analytics.topParadaMotivo.sampleObservation ||
                    'Sin observaciones registradas en los avisos de este motivo.'}
                </p>
              )}
            </div>

            <div className="px-5 py-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-amber-800">
                  Motivo Preponderante de Vacíos (Quemado)
                </span>
                {analytics.topVacioMotivo && (
                  <span className="font-mono tabular-nums text-slate-600">
                    {analytics.topVacioMotivo.minutes.toLocaleString('es-AR')} min ·{' '}
                    {analytics.topVacioMotivo.count} ev ({analytics.topVacioMotivo.sharePercent.toFixed(1)}%)
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-900">
                {analytics.topVacioMotivo?.name ?? 'Sin vacíos registrados en el filtro'}
              </p>
              {analytics.topVacioMotivo && (
                <p className="text-xs text-slate-600 leading-snug">
                  <span className="font-medium text-slate-700">Observación SAP: </span>
                  {analytics.topVacioMotivo.sampleObservation ||
                    'Sin observaciones registradas en los avisos de este motivo.'}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Daily Averages by Motif Card (Based on Total Unique Days with Events in Period) */}
      <section
        aria-label="Promedios Diarios por motivo de parada o vacío"
        className="rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid"
      >
        <div className="border-b border-slate-200 px-5 py-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Promedios Diarios · {activeScopeLabel}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Promedio de minutos diarios por motivo calculado sobre los{' '}
                <strong className="font-mono text-slate-700">
                  {dailyAveragesData.uniqueDaysCount}
                </strong>{' '}
                {dailyAveragesData.uniqueDaysCount === 1
                  ? 'día único con eventos'
                  : 'días únicos con eventos'}{' '}
                del periodo seleccionado
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start lg:self-auto no-print">
              {(
                [
                  { id: 'all', label: 'Todos los motivos' },
                  { id: 'paradas', label: 'Paradas' },
                  { id: 'vacios', label: 'Vacíos (Quemado)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDailyAvgScope(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    dailyAvgScope === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs font-mono tabular-nums text-slate-600">
            <span>
              Base del periodo:{' '}
              <strong className="text-slate-900">
                {dailyAveragesData.uniqueDaysCount}{' '}
                {dailyAveragesData.uniqueDaysCount === 1 ? 'día único' : 'días únicos'}
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Promedio total diario:{' '}
              <strong className="text-slate-900">
                {dailyAveragesData.totalScopedAvgDaily.toLocaleString('es-AR')} min/día
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Paradas/día:{' '}
              <strong className="text-blue-700">
                {dailyAveragesData.totalParadaDaily.toLocaleString('es-AR')} min/día
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Vacíos/día:{' '}
              <strong className="text-amber-700">
                {dailyAveragesData.totalVacioDaily.toLocaleString('es-AR')} min/día
              </strong>
            </span>
          </div>
        </div>

        {dailyAveragesData.items.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">
            Sin eventos en el tipo seleccionado para calcular promedios diarios.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 pl-5 pr-2 font-medium w-10">#</th>
                  <th className="py-2.5 px-3 font-medium">Motivo (Parada / Vacío)</th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">Clasificación</th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Presencia</th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Acumulado</th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap text-blue-800">
                    Paradas / Día
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap text-amber-800">
                    Vacíos / Día
                  </th>
                  <th className="py-2.5 pl-3 pr-5 font-medium text-right whitespace-nowrap text-slate-900">
                    Prom. Diario
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyAveragesData.items.map((item, idx) => {
                  const tipoLabel =
                    dailyAvgScope === 'paradas'
                      ? 'Parada'
                      : dailyAvgScope === 'vacios'
                        ? 'Vacío (Quemado)'
                        : item.hasVacio && item.hasParada
                          ? 'Vacío + Parada'
                          : item.hasVacio
                            ? 'Vacío (Quemado)'
                            : 'Parada';
                  const tipoColor =
                    dailyAvgScope === 'paradas'
                      ? 'text-blue-800'
                      : dailyAvgScope === 'vacios'
                        ? 'text-amber-800'
                        : item.hasVacio && item.hasParada
                          ? 'text-slate-700'
                          : item.hasVacio
                            ? 'text-amber-800'
                            : 'text-blue-800';
                  const barPct = (item.avgPerUniqueDay / dailyAveragesData.maxAvgDaily) * 100;
                  const isFiltered =
                    motivoSearch.trim().toLowerCase() === item.name.toLowerCase();

                  return (
                    <tr
                      key={item.name}
                      onClick={() => setMotivoSearch(isFiltered ? '' : item.name)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        isFiltered ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <td className="py-2.5 pl-5 pr-2 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 min-w-[230px] max-w-[360px]">
                        <div className="font-medium text-slate-900 leading-snug">{item.name}</div>
                        <div className="mt-1 h-1.5 w-full max-w-[180px] rounded-xs bg-slate-100 overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, barPct)}%` }}
                            className={`h-full ${
                              dailyAvgScope === 'vacios' || (!item.hasParada && item.hasVacio)
                                ? 'bg-amber-500'
                                : 'bg-blue-700'
                            }`}
                          />
                        </div>
                        {item.sampleObservation && (
                          <p
                            className="mt-1 text-[11px] text-slate-600 line-clamp-1"
                            title={item.sampleObservation}
                          >
                            Obs.: {item.sampleObservation}
                          </p>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-medium whitespace-nowrap ${tipoColor}`}>
                        {tipoLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {item.activeDaysCount > 0
                          ? `${item.activeDaysCount}/${dailyAveragesData.uniqueDaysCount} días`
                          : `—`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {item.scopedMinutes.toLocaleString('es-AR')} min
                        <span className="block text-[11px] text-slate-400">
                          {item.scopedCount} ev.
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-800 whitespace-nowrap">
                        {item.paradaDaily > 0 ? `${item.paradaDaily.toLocaleString('es-AR')} m/d` : '0 m/d'}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                          item.vacioDaily > 0 ? 'font-medium text-amber-700' : 'text-slate-400'
                        }`}
                      >
                        {item.vacioDaily > 0 ? `${item.vacioDaily.toLocaleString('es-AR')} m/d` : '0 m/d'}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {item.avgPerUniqueDay.toLocaleString('es-AR')} min/día
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-slate-200 bg-slate-50 font-mono text-xs tabular-nums">
                <tr>
                  <td className="py-2.5 pl-5 pr-2 text-slate-500">—</td>
                  <td colSpan={3} className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                    TOTAL ({dailyAveragesData.items.length} motivos ÷{' '}
                    {dailyAveragesData.uniqueDaysCount}{' '}
                    {dailyAveragesData.uniqueDaysCount === 1 ? 'día' : 'días'})
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                    {dailyAveragesData.totalScopedMinutes.toLocaleString('es-AR')} min
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-blue-800 whitespace-nowrap">
                    {dailyAveragesData.totalParadaDaily.toLocaleString('es-AR')} m/d
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                    {dailyAveragesData.totalVacioDaily.toLocaleString('es-AR')} m/d
                  </td>
                  <td className="py-2.5 pl-3 pr-5 text-right font-bold text-slate-900 whitespace-nowrap">
                    {dailyAveragesData.totalScopedAvgDaily.toLocaleString('es-AR')} min/día
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Dedicated Full Motivos Breakdown by Unit / Line (PP1, PM1, PM2...) */}
      <section
        aria-label="Todos los motivos y minutos de parada y vacíos por línea o unidad"
        className="rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid"
      >
        <div className="border-b border-slate-200 px-5 py-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 text-balance">
                Desglose Completo por Motivo · {activeScopeLabel}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Detalle íntegro de todos los motivos con minutos acumulados de Parada (Prensado/Esmaltado), Vacío de Horno (Quemado) y promedio diario.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 no-print">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={motivoSearch}
                  onChange={(e) => setMotivoSearch(e.target.value)}
                  placeholder="Buscar motivo o código (ej. Q324)..."
                  aria-label="Filtrar motivos"
                  className="h-9 w-64 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
              </div>

              {filteredAndSortedMotivos.some((m) => (m.topObservations?.length ?? 0) > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !expandAllObservations;
                    setExpandAllObservations(next);
                    const mapped: Record<string, boolean> = {};
                    filteredAndSortedMotivos.forEach((m) => {
                      mapped[m.name] = next;
                    });
                    setExpandedMotivos(mapped);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <MessageSquareText className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>{expandAllObservations ? 'Contraer Obs.' : 'Ver Todas las Obs.'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={filteredAndSortedMotivos.length === 0}
                onClick={handleExportMotivosCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>Exportar Motivos CSV</span>
              </button>
            </div>
          </div>

          {/* Quick Unit / Group Selector & Type Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {quickSelectorItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  Línea / Unidad:
                </span>
                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectUnit('all');
                      if (quickSelectorMode === 'group' && onSelectGroup) onSelectGroup('all');
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      selectedUnit === 'all' &&
                      (quickSelectorMode !== 'group' || selectedGroup === 'all')
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas ({quickSelectorItems.length})
                  </button>
                  {quickSelectorItems.map((item) => {
                    const isActive =
                      quickSelectorMode === 'unit'
                        ? selectedUnit.toLowerCase() === item.toLowerCase()
                        : quickSelectorMode === 'group'
                          ? selectedGroup.toLowerCase() === item.toLowerCase()
                          : selectedSector.toLowerCase() === item.toLowerCase();
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          if (quickSelectorMode === 'unit') {
                            onSelectUnit(isActive ? 'all' : item);
                          } else if (quickSelectorMode === 'group' && onSelectGroup) {
                            onSelectGroup(isActive ? 'all' : item);
                          }
                        }}
                        className={`rounded-md px-3 py-1 text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'text-slate-700 hover:bg-white hover:text-slate-900'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto no-print">
              {(
                [
                  { id: 'all', label: 'Paradas + Vacíos' },
                  { id: 'paradas', label: 'Solo Paradas' },
                  { id: 'vacios', label: 'Solo Vacíos' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeTypeFilter(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    typeFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Unboxed Summary Metadata Strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              <strong className="text-slate-900">{filteredAndSortedMotivos.length}</strong> motivos
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              <strong className="text-slate-900">{motivoTableTotals.count}</strong> eventos
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Paradas:{' '}
              <strong className="text-blue-700">
                {Math.round(motivoTableTotals.paradaMinutes).toLocaleString('es-AR')} min
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Vacíos (Quemado):{' '}
              <strong className="text-amber-700">
                {Math.round(motivoTableTotals.vacioMinutes).toLocaleString('es-AR')} min
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>
              Acumulado:{' '}
              <strong className="text-slate-900">
                {Math.round(motivoTableTotals.minutes).toLocaleString('es-AR')} min (
                {formatMinutesAsHours(motivoTableTotals.minutes)})
              </strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 pl-5 pr-2 font-medium w-10">#</th>
                <th className="py-2.5 px-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('name')}
                    className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                  >
                    <span>Motivo (Código y Descripción)</span>
                    {renderSortIcon('name')}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Clasificación</th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('count')}
                    className="inline-flex items-center justify-end gap-1 font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                  >
                    <span>Eventos</span>
                    {renderSortIcon('count')}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('paradaMinutes')}
                    className="inline-flex items-center justify-end gap-1 font-medium text-blue-800 hover:text-blue-950 whitespace-nowrap"
                  >
                    <span>Min. Paradas</span>
                    {renderSortIcon('paradaMinutes')}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('vacioMinutes')}
                    className="inline-flex items-center justify-end gap-1 font-medium text-amber-800 hover:text-amber-950 whitespace-nowrap"
                  >
                    <span>Min. Vacíos</span>
                    {renderSortIcon('vacioMinutes')}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('minutes')}
                    className="inline-flex items-center justify-end gap-1 font-medium text-slate-900 hover:text-blue-700 whitespace-nowrap"
                  >
                    <span>Total Min.</span>
                    {renderSortIcon('minutes')}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSort('avgDailyMinutes')}
                    className="inline-flex items-center justify-end gap-1 font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                  >
                    <span>Prom. Diario</span>
                    {renderSortIcon('avgDailyMinutes')}
                  </button>
                </th>
                <th className="py-2.5 pl-3 pr-5 font-medium text-right whitespace-nowrap">
                  % Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedMotivos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">
                    <div>
                      No se encontraron motivos de parada o vacío para la selección actual.
                    </div>
                    {onResetFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setMotivoSearch('');
                          onResetFilters();
                        }}
                        className="mt-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Restablecer todos los filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredAndSortedMotivos.map((item, idx) => {
                  const hasVacio = item.vacioMinutes > 0;
                  const hasParada = item.paradaMinutes > 0;
                  const tipoText =
                    hasVacio && hasParada
                      ? 'Vacío + Parada'
                      : hasVacio
                        ? 'Vacío (Quemado)'
                        : 'Parada';
                  const tipoColor =
                    hasVacio && hasParada
                      ? 'text-slate-700'
                      : hasVacio
                        ? 'text-amber-800'
                        : 'text-blue-800';
                  const maxMotivoMin = Math.max(1, filteredAndSortedMotivos[0]?.minutes ?? 1);
                  const observations = item.topObservations ?? [];
                  const isGlobalMotivoSelected =
                    selectedMotivo !== 'all' &&
                    selectedMotivo.toLowerCase() === item.name.toLowerCase();
                  const isExpanded =
                    expandedMotivos[item.name] ??
                    (isGlobalMotivoSelected || filteredAndSortedMotivos.length === 1);

                  return (
                    <React.Fragment key={item.name}>
                      <tr
                        className={`transition-colors ${
                          isGlobalMotivoSelected
                            ? 'bg-blue-50/50 hover:bg-blue-50/70'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-2.5 pl-5 pr-2 font-mono tabular-nums text-slate-400 align-top">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 min-w-[250px] max-w-[400px] align-top">
                          <div className="leading-snug">{item.name}</div>
                          <div className="mt-1 h-1 w-full max-w-[180px] rounded-xs bg-slate-100 overflow-hidden flex">
                            {item.vacioMinutes > 0 && (
                              <div
                                style={{
                                  width: `${(item.vacioMinutes / maxMotivoMin) * 100}%`,
                                }}
                                className="h-full bg-amber-500"
                                title={`Vacíos: ${item.vacioMinutes} min`}
                              />
                            )}
                            {item.paradaMinutes > 0 && (
                              <div
                                style={{
                                  width: `${(item.paradaMinutes / maxMotivoMin) * 100}%`,
                                }}
                                className="h-full bg-blue-700"
                                title={`Paradas: ${item.paradaMinutes} min`}
                              />
                            )}
                          </div>
                          {item.sampleObservation && (
                            <p
                              className="mt-1 text-[11px] font-normal text-slate-600 line-clamp-2 leading-snug"
                              title={observations
                                .map((o) => `• ${o.text} (${o.minutes} min · ${o.count} ev.)`)
                                .join('\n')}
                            >
                              Obs.: {item.sampleObservation}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-normal no-print">
                            {observations.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMotivos((prev) => ({
                                    ...prev,
                                    [item.name]: !isExpanded,
                                  }))
                                }
                                className="inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                                )}
                                <span>
                                  {isExpanded
                                    ? `Ocultar observaciones (${observations.length})`
                                    : `Ver ${observations.length} ${
                                        observations.length === 1 ? 'observación' : 'observaciones'
                                      }`}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-400">Sin observaciones SAP</span>
                            )}

                            {onSelectMotivo && (
                              <button
                                type="button"
                                onClick={() => onSelectMotivo(item.name)}
                                className={`inline-flex items-center gap-1 font-medium hover:underline whitespace-nowrap ${
                                  isGlobalMotivoSelected
                                    ? 'text-amber-700 hover:text-amber-900'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <Filter className="h-3 w-3" aria-hidden="true" />
                                <span>
                                  {isGlobalMotivoSelected
                                    ? 'Quitar filtro de código'
                                    : 'Filtrar este motivo'}
                                </span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 font-medium whitespace-nowrap align-top ${tipoColor}`}>
                          {tipoText}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap align-top">
                          {item.count}
                          {hasVacio && hasParada && (
                            <span className="ml-1 text-[11px] text-slate-400">
                              ({item.vacioCount}V/{item.paradaCount}P)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap align-top">
                          {item.paradaMinutes > 0
                            ? `${Math.round(item.paradaMinutes).toLocaleString('es-AR')} min`
                            : '0 min'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap align-top ${
                            item.vacioMinutes > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {item.vacioMinutes > 0
                            ? `${Math.round(item.vacioMinutes).toLocaleString('es-AR')} min`
                            : '0 min'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap align-top">
                          <span className="font-semibold text-slate-900">
                            {Math.round(item.minutes).toLocaleString('es-AR')} min
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {formatMinutesAsHours(item.minutes)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-blue-700 whitespace-nowrap align-top">
                          {item.avgDailyMinutes} m/día
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap align-top">
                          {item.sharePercent.toFixed(1)}%
                        </td>
                      </tr>

                      {isExpanded && observations.length > 0 && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={9} className="px-5 py-3.5 pl-11 border-t border-slate-100">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                              <span className="font-semibold text-slate-800">
                                Observaciones SAP registradas en {item.name}
                              </span>
                              <span className="font-mono tabular-nums text-slate-500">
                                {observations.length}{' '}
                                {observations.length === 1
                                  ? 'observación distinta'
                                  : 'observaciones distintas'}{' '}
                                · {item.count} {item.count === 1 ? 'evento' : 'eventos'}
                              </span>
                            </div>

                            <div className="mt-2 divide-y divide-slate-200/80 border-t border-slate-200">
                              {observations.map((obs, obsIdx) => (
                                <div
                                  key={`${item.name}-obs-${obsIdx}`}
                                  className="py-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs text-slate-900 leading-snug">
                                      <span className="font-mono text-slate-400 mr-1.5">
                                        {obsIdx + 1}.
                                      </span>
                                      {obs.text}
                                    </p>
                                    {(obs.machines?.length ||
                                      obs.dates?.length ||
                                      obs.notices?.length) && (
                                      <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                                        {obs.machines && obs.machines.length > 0 && (
                                          <span>Máq.: {obs.machines.join(', ')}</span>
                                        )}
                                        {obs.machines &&
                                          obs.machines.length > 0 &&
                                          obs.dates &&
                                          obs.dates.length > 0 && (
                                            <span className="mx-1.5 text-slate-300">·</span>
                                          )}
                                        {obs.dates && obs.dates.length > 0 && (
                                          <span>
                                            Fechas: {obs.dates.slice(0, 6).join(', ')}
                                            {obs.dates.length > 6
                                              ? ` (+${obs.dates.length - 6})`
                                              : ''}
                                          </span>
                                        )}
                                        {obs.notices && obs.notices.length > 0 && (
                                          <>
                                            <span className="mx-1.5 text-slate-300">·</span>
                                            <span>
                                              Avisos SAP: {obs.notices.slice(0, 5).join(', ')}
                                              {obs.notices.length > 5
                                                ? ` (+${obs.notices.length - 5})`
                                                : ''}
                                            </span>
                                          </>
                                        )}
                                      </p>
                                    )}
                                  </div>
                                  <div className="font-mono text-[11px] tabular-nums text-slate-700 whitespace-nowrap shrink-0">
                                    <strong className="text-slate-900">
                                      {Math.round(obs.minutes).toLocaleString('es-AR')} min
                                    </strong>{' '}
                                    ({formatMinutesAsHours(obs.minutes)}) · {obs.count}{' '}
                                    {obs.count === 1 ? 'ev.' : 'evs.'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {filteredAndSortedMotivos.length > 0 && (
              <tfoot className="sticky bottom-0 border-t-2 border-slate-200 bg-slate-50 font-mono text-xs tabular-nums">
                <tr>
                  <td className="py-2.5 pl-5 pr-2 text-slate-500">—</td>
                  <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                    TOTAL ({filteredAndSortedMotivos.length} motivos)
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 font-sans">Acumulado</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {motivoTableTotals.count}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-blue-800">
                    {Math.round(motivoTableTotals.paradaMinutes).toLocaleString('es-AR')} min
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-amber-700">
                    {Math.round(motivoTableTotals.vacioMinutes).toLocaleString('es-AR')} min
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    {Math.round(motivoTableTotals.minutes).toLocaleString('es-AR')} min
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500">—</td>
                  <td className="py-2.5 pl-3 pr-5 text-right font-semibold text-slate-900">
                    {motivoTableTotals.sharePercent.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Recharts Trend Charts & Top Motivos Bar Chart */}
      <section
        aria-label="Gráficos de tendencias y motivos principales"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-break-inside-avoid"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Tendencia Mensual: Vacíos vs Paradas (Horas)
              </h3>
              <p className="text-xs text-slate-500">
                Evolución de inactividad operativa · {activeScopeLabel}
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="vaciosGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="paradasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" unit="h" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: 'none',
                  }}
                  formatter={(val) => [`${val ?? 0} horas`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area
                  type="monotone"
                  dataKey="vaciosHoras"
                  name="Vacíos (Quemado)"
                  stroke="#d97706"
                  fill="url(#vaciosGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="paradasHoras"
                  name="Paradas"
                  stroke="#1d4ed8"
                  fill="url(#paradasGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Top 10 Motivos con Mayor Acumulado (Minutos)
              </h3>
              <p className="text-xs text-slate-500">Principales causas en {activeScopeLabel}</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMotivosBarData} layout="vertical" margin={{ top: 5, right: 16, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" unit="m" />
                <YAxis type="category" dataKey="name" width={135} tick={{ fontSize: 10, fill: '#334155' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: 'none',
                  }}
                  formatter={(val) => [`${val ?? 0} min`, 'Minutos Totales']}
                />
                <Bar dataKey="minutos" radius={[0, 4, 4, 0]}>
                  {topMotivosBarData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === 0 ? '#b91c1c' : index === 1 ? '#d97706' : '#1d4ed8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* OEE Efficiency KPI Section — Single-Elevation Clean Table (No Nested Cards) */}
      <section
        aria-label="KPI de Eficiencia Operativa OEE"
        className="rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid"
      >
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                KPI de Eficiencia Operativa — OEE por Máquina ({machineOEEList.length})
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Disponibilidad (Tiempo Operativo vs Inactivo) × Rendimiento Est. (94%) × Calidad Est. (96%) · {activeScopeLabel}
            </p>
          </div>
          <span className="font-mono text-xs text-slate-600 whitespace-nowrap shrink-0">
            Base: {estimatedTotalDays} días SAP
          </span>
        </div>

        {machineOEEList.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            Sin máquinas en el filtro actual para calcular OEE.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 pl-5 pr-3 font-medium">Máquina / Equipo</th>
                  <th className="py-2.5 px-3 font-medium text-right">Eventos</th>
                  <th className="py-2.5 px-3 font-medium text-right">Inactividad</th>
                  <th className="py-2.5 px-3 font-medium">Disponibilidad</th>
                  <th className="py-2.5 px-3 font-medium text-right">Rend. Est.</th>
                  <th className="py-2.5 px-3 font-medium text-right">Calidad Est.</th>
                  <th className="py-2.5 pl-3 pr-5 font-medium text-right">OEE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {machineOEEList.map((m) => {
                  const oeeColor =
                    m.oeePercent >= 80
                      ? 'text-emerald-700'
                      : m.oeePercent >= 65
                        ? 'text-amber-700'
                        : 'text-red-700';

                  return (
                    <tr
                      key={m.name}
                      onClick={() => onSelectMachine && onSelectMachine(m.name)}
                      className="h-11 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-2 pl-5 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {m.name}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {m.count}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatMinutesAsHours(m.downtimeMin)}
                        <span className="block text-[11px] text-slate-400">
                          {Math.round(m.vacioMin)}m V · {Math.round(m.paradaMin)}m P
                        </span>
                      </td>
                      <td className="py-2 px-3 min-w-[160px]">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-xs overflow-hidden">
                            <div
                              style={{ width: `${m.availabilityPercent}%` }}
                              className="h-full bg-blue-700"
                            />
                          </div>
                          <span className="w-12 text-right font-medium text-slate-900">
                            {m.availabilityPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {m.performancePercent}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {m.qualityPercent}%
                      </td>
                      <td className={`py-2 pl-3 pr-5 text-right font-mono tabular-nums font-bold ${oeeColor}`}>
                        {m.oeePercent}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Key Drivers / Critical Leaders */}
      <section aria-label="Principales responsables de paradas y vacíos" className="print-break-inside-avoid">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Diagnóstico de Mayor Impacto · {activeScopeLabel}
          </h2>
          <span className="text-xs text-slate-500">
            Clasificado por minutos acumulados y promedio diario
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() =>
              analytics.topGrupoByMinutes &&
              onSelectGroup &&
              onSelectGroup(analytics.topGrupoByMinutes.name)
            }
            className="text-left rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between transition-colors hover:border-slate-300 hover:bg-slate-50/40"
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Grupo con Mayor Tiempo Muerto</span>
              </div>
              <p className="mt-2 text-base font-semibold text-slate-900 line-clamp-2">
                {analytics.topGrupoByMinutes?.name ?? '—'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums w-full">
              <span className="font-semibold text-slate-900">
                {analytics.topGrupoByMinutes?.minutes.toLocaleString('es-AR') ?? 0} min (
                {analytics.topGrupoByMinutes?.sharePercent.toFixed(1) ?? 0}%)
              </span>
              <span className="text-slate-500">
                {analytics.topGrupoByMinutes?.avgDailyMinutes ?? 0} m/día
              </span>
            </div>
          </button>

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Motivo Más Preponderante</span>
              </div>
              <p
                className="mt-2 text-base font-semibold text-slate-900 line-clamp-2"
                title={analytics.topMotivoByMinutes?.name}
              >
                {analytics.topMotivoByMinutes?.name ?? '—'}
              </p>
              {analytics.topMotivoByMinutes?.sampleObservation && (
                <p
                  className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-snug"
                  title={analytics.topMotivoByMinutes.sampleObservation}
                >
                  Obs.: {analytics.topMotivoByMinutes.sampleObservation}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">
                {analytics.topMotivoByMinutes?.minutes.toLocaleString('es-AR') ?? 0} min
              </span>
              <span className="text-blue-700 font-semibold">
                {analytics.topMotivoByMinutes?.avgDailyMinutes ?? 0} min/día
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              analytics.topMaquinaByMinutes &&
              onSelectMachine &&
              onSelectMachine(analytics.topMaquinaByMinutes.name)
            }
            className="text-left rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between transition-colors hover:border-slate-300 hover:bg-slate-50/40"
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Cpu className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Máquina con Más Tiempo Muerto</span>
              </div>
              <p className="mt-2 font-mono text-base font-semibold text-slate-900 truncate">
                {analytics.topMaquinaByMinutes?.name ?? '—'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums w-full">
              <span className="font-semibold text-slate-900">
                {analytics.topMaquinaByMinutes?.minutes.toLocaleString('es-AR') ?? 0} min (
                {analytics.topMaquinaByMinutes?.sharePercent.toFixed(1) ?? 0}%)
              </span>
              <span className="text-slate-500">
                {analytics.topMaquinaByMinutes?.avgDailyMinutes ?? 0} m/día
              </span>
            </div>
          </button>

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Activity className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Proceso Dominante (Quemado = Vacío)</span>
              </div>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {analytics.topProcesoByMinutes?.name ?? '—'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">
                {analytics.topProcesoByMinutes?.minutes.toLocaleString('es-AR') ?? 0} min (
                {analytics.topProcesoByMinutes?.sharePercent.toFixed(1) ?? 0}%)
              </span>
              <span className="text-slate-500">
                {analytics.topProcesoByMinutes?.count ?? 0} eventos
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Sector / Planta de Mayor Impacto</span>
              </div>
              <p className="mt-2 text-base font-semibold text-slate-900 truncate">
                {analytics.topSectorByMinutes?.name ?? '—'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">
                {analytics.topSectorByMinutes?.minutes.toLocaleString('es-AR') ?? 0} min (
                {analytics.topSectorByMinutes?.sharePercent.toFixed(1) ?? 0}%)
              </span>
              <span className="text-slate-500">
                {analytics.topSectorByMinutes?.count ?? 0} eventos
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Fecha Pico de Vacíos y Paradas</span>
              </div>
              <p className="mt-2 font-mono text-base font-semibold tabular-nums text-slate-900">
                {analytics.peakDateByMinutes?.date ?? '—'}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="font-semibold text-slate-900">
                {analytics.peakDateByMinutes?.totalMinutes.toLocaleString('es-AR') ?? 0} min (
                {analytics.peakDateByMinutes?.totalCount ?? 0} ev.)
              </span>
              <span className="text-amber-700">
                {analytics.peakDateByMinutes?.vacioMinutes ?? 0}m vacíos
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Daily Timeline + Dimension Breakdown Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          aria-label="Evolución diaria de vacíos y paradas"
          className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between print-break-inside-avoid"
        >
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Distribución Diaria por Fecha SAP
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Comparativa diaria: Vacíos vs Paradas
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" aria-hidden="true" />
                  Vacíos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-blue-700" aria-hidden="true" />
                  Paradas
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {analytics.dailyTimeline.map((day) => {
                const vacioPct = (day.vacioMinutes / maxDailyMinutes) * 100;
                const paradaPct = (day.paradaMinutes / maxDailyMinutes) * 100;
                const isPeak = analytics.peakDateByMinutes?.date === day.date;

                return (
                  <div key={day.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className={isPeak ? 'font-semibold text-slate-900' : 'text-slate-600'}>
                        {day.date} {isPeak ? '· Pico' : ''}
                      </span>
                      <span className="text-slate-700">
                        {Math.round(day.totalMinutes)} min ({day.totalCount} ev.)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-xs bg-slate-100 overflow-hidden flex">
                      {day.vacioMinutes > 0 && (
                        <div
                          style={{ width: `${vacioPct}%` }}
                          className="h-full bg-amber-500 transition-all"
                          title={`Vacíos: ${Math.round(day.vacioMinutes)} min`}
                        />
                      )}
                      {day.paradaMinutes > 0 && (
                        <div
                          style={{ width: `${paradaPct}%` }}
                          className="h-full bg-blue-700 transition-all"
                          title={`Paradas: ${Math.round(day.paradaMinutes)} min`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {analytics.peakVacioDate && (
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>Mayor volumen de vacíos:</span>
              <span className="font-mono font-semibold tabular-nums text-amber-800">
                {analytics.peakVacioDate.date} · {Math.round(analytics.peakVacioDate.vacioMinutes)} min
              </span>
            </div>
          )}
        </section>

        {/* Pareto / Dimension Breakdown Table */}
        <section
          aria-label="Desglose por máquina, grupo, producto, proceso y turno"
          className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-hidden print-break-inside-avoid flex flex-col"
        >
          <div className="border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Desglose Pareto por Dimensión
              </h3>
              <p className="text-xs text-slate-500">
                Hacé clic en una máquina, grupo o motivo para filtrar todo el análisis
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto no-print">
              {(
                [
                  { id: 'maquina', label: 'Máquina' },
                  { id: 'grupo', label: 'Grupo' },
                  { id: 'producto', label: 'Producto' },
                  { id: 'proceso', label: 'Proceso' },
                  { id: 'sector', label: 'Sector' },
                  { id: 'turno', label: 'Turno' },
                  { id: 'motivo', label: 'Motivo' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRankingTab(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    rankingTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto flex-1">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 pl-5 pr-3 font-medium">Categoría</th>
                  <th className="py-2.5 px-3 font-medium text-right">Eventos</th>
                  <th className="py-2.5 px-3 font-medium text-right">Paradas</th>
                  <th className="py-2.5 px-3 font-medium text-right">Vacíos</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total min</th>
                  <th className="py-2.5 px-3 font-medium text-right text-blue-700">Prom. Diario</th>
                  <th className="py-2.5 pl-3 pr-5 font-medium text-right">% Acum.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRankingList.map((item) => {
                  const canFilter =
                    rankingTab === 'grupo' ||
                    rankingTab === 'maquina' ||
                    (rankingTab === 'motivo' && Boolean(onSelectMotivo));
                  const topVal = Math.max(1, activeRankingList[0]?.minutes ?? 1);
                  return (
                    <tr
                      key={item.name}
                      onClick={() => {
                        if (rankingTab === 'grupo' && onSelectGroup) onSelectGroup(item.name);
                        if (rankingTab === 'maquina' && onSelectMachine) onSelectMachine(item.name);
                        if (rankingTab === 'motivo' && onSelectMotivo) onSelectMotivo(item.name);
                      }}
                      className={`h-10 transition-colors hover:bg-slate-50 ${
                        canFilter ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-2 pl-5 pr-3 max-w-[240px]">
                        <div className="truncate font-medium text-slate-900" title={item.name}>
                          {item.name}
                        </div>
                        {rankingTab === 'motivo' && item.sampleObservation && (
                          <div
                            className="truncate text-[11px] text-slate-500"
                            title={item.sampleObservation}
                          >
                            Obs.: {item.sampleObservation}
                          </div>
                        )}
                        <div className="mt-1 h-1.5 w-full max-w-[140px] rounded-xs bg-slate-100 overflow-hidden flex">
                          {item.vacioMinutes > 0 && (
                            <div
                              style={{
                                width: `${(item.vacioMinutes / topVal) * 100}%`,
                              }}
                              className="h-full bg-amber-500"
                            />
                          )}
                          {item.paradaMinutes > 0 && (
                            <div
                              style={{
                                width: `${(item.paradaMinutes / topVal) * 100}%`,
                              }}
                              className="h-full bg-blue-700"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                        {item.count}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {Math.round(item.paradaMinutes).toLocaleString('es-AR')}m
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700">
                        {Math.round(item.vacioMinutes).toLocaleString('es-AR')}m
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {Math.round(item.minutes).toLocaleString('es-AR')} m
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-blue-700">
                        {item.avgDailyMinutes} m/d
                      </td>
                      <td className="py-2 pl-3 pr-5 text-right font-mono tabular-nums text-slate-500">
                        {item.cumulativePercent.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
