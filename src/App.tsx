import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Flame,
  ListFilter,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CsvDropZone } from './components/CsvDropZone';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { MonthlyComparisonView } from './components/MonthlyComparisonView';
import { VoidsAnalysisView } from './components/VoidsAnalysisView';
import { CsvParseResult, DowntimeEvent } from './types/csv';
import {
  CORE_SAP_COLUMNS,
  IGNORED_SAP_AUDIT_COLUMNS,
  rehydrateBatches,
  SAMPLE_CERAMIC_PLANT_CSV,
} from './utils/csvParser';
import {
  computeDowntimeAnalytics,
  eventMatchesUnit,
  extractUnitOptions,
  filterDowntimeEvents,
  formatMinutesAsHours,
  formatMonthLabel,
} from './utils/downtimeAnalytics';

type ActiveView = 'resumen' | 'vacios' | 'mensual' | 'eventos' | 'carga';
type EventTypeFilter = 'all' | 'vacios' | 'paradas';

const STORAGE_KEY = 'kilnpulse_batches_v4';

export default function App() {
  const [batches, setBatches] = useState<CsvParseResult[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return rehydrateBatches(parsed);
      }
    } catch {
      // Ignore storage read errors
    }
    return [];
  });

  const [activeView, setActiveView] = useState<ActiveView>(() =>
    batches.length > 0 ? 'resumen' : 'carga'
  );

  // Global Filters
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [processFilter, setProcessFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [motivoFilter, setMotivoFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [eventsPage, setEventsPage] = useState<number>(1);
  const EVENTS_PAGE_SIZE = 100;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
    } catch {
      // Ignore quota exceeded errors
    }
  }, [batches]);

  const allEvents = useMemo<DowntimeEvent[]>(() => {
    return batches.flatMap((b) => b.events);
  }, [batches]);

  const filterOptions = useMemo(() => {
    const months = new Set<string>();
    const sectors = new Map<string, string>();
    const processes = new Map<string, string>();
    const groups = new Map<string, string>();
    const machines = new Map<string, string>();
    const motivos = new Map<string, string>();

    const addNormalized = (map: Map<string, string>, raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) {
        map.set(key, trimmed);
      }
    };

    for (const ev of allEvents) {
      if (ev.monthKey) months.add(ev.monthKey);
      if (ev.centro) addNormalized(sectors, ev.centro);
      if (ev.proceso) addNormalized(processes, ev.proceso);
      if (ev.grupo) addNormalized(groups, ev.grupo);
      if (ev.maquina) addNormalized(machines, ev.maquina);
      if (ev.motivo) addNormalized(motivos, ev.motivo);
    }

    return {
      months: Array.from(months).sort((a, b) => b.localeCompare(a)),
      sectors: Array.from(sectors.values()).sort((a, b) => a.localeCompare(b, 'es')),
      processes: Array.from(processes.values()).sort((a, b) => a.localeCompare(b, 'es')),
      groups: Array.from(groups.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      machines: Array.from(machines.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      motivos: Array.from(motivos.values()).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    };
  }, [allEvents]);

  const unitOptions = useMemo(() => extractUnitOptions(allEvents), [allEvents]);

  const contextualCounts = useMemo(() => {
    const baseCriteria = {
      unit: unitFilter,
      month: monthFilter,
      sector: sectorFilter,
      process: processFilter,
      group: groupFilter,
      machine: machineFilter,
      motivo: motivoFilter,
      type: typeFilter,
      searchQuery,
    };

    const countMap = (
      exclude: 'month' | 'sector' | 'process' | 'group' | 'machine' | 'motivo',
      getter: (ev: DowntimeEvent) => string | null
    ) => {
      const subset = filterDowntimeEvents(allEvents, {
        ...baseCriteria,
        [exclude]: 'all',
      });
      const counts = new Map<string, number>();
      for (const ev of subset) {
        const val = getter(ev)?.trim();
        if (!val) continue;
        const key = val.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    const unitSubset = filterDowntimeEvents(allEvents, {
      ...baseCriteria,
      unit: 'all',
    });
    const unitCounts = new Map<string, number>();
    for (const u of unitOptions) {
      unitCounts.set(u.toLowerCase(), unitSubset.filter((ev) => eventMatchesUnit(ev, u)).length);
    }

    return {
      units: unitCounts,
      months: countMap('month', (e) => e.monthKey),
      sectors: countMap('sector', (e) => e.centro),
      processes: countMap('process', (e) => e.proceso),
      groups: countMap('group', (e) => e.grupo),
      machines: countMap('machine', (e) => e.maquina),
      motivos: countMap('motivo', (e) => e.motivo),
    };
  }, [
    allEvents,
    unitOptions,
    unitFilter,
    monthFilter,
    sectorFilter,
    processFilter,
    groupFilter,
    machineFilter,
    motivoFilter,
    typeFilter,
    searchQuery,
  ]);

  const filteredEvents = useMemo(() => {
    return filterDowntimeEvents(allEvents, {
      unit: unitFilter,
      month: monthFilter,
      sector: sectorFilter,
      process: processFilter,
      group: groupFilter,
      machine: machineFilter,
      motivo: motivoFilter,
      type: typeFilter,
      searchQuery,
    });
  }, [
    allEvents,
    unitFilter,
    monthFilter,
    sectorFilter,
    processFilter,
    groupFilter,
    machineFilter,
    motivoFilter,
    typeFilter,
    searchQuery,
  ]);

  const analytics = useMemo(
    () => computeDowntimeAnalytics(filteredEvents),
    [filteredEvents]
  );

  const eventsTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE));
  const safeEventsPage = Math.min(eventsPage, eventsTotalPages);
  const paginatedFilteredEvents = useMemo(() => {
    const start = (safeEventsPage - 1) * EVENTS_PAGE_SIZE;
    return filteredEvents.slice(start, start + EVENTS_PAGE_SIZE);
  }, [filteredEvents, safeEventsPage]);

  useEffect(() => {
    setEventsPage(1);
  }, [unitFilter, monthFilter, sectorFilter, processFilter, groupFilter, machineFilter, motivoFilter, typeFilter, searchQuery, batches.length]);

  const voidViewEvents = useMemo(() => {
    return filterDowntimeEvents(allEvents, {
      unit: unitFilter,
      month: monthFilter,
      sector: sectorFilter,
      process: processFilter,
      group: groupFilter,
      machine: machineFilter,
      motivo: motivoFilter,
      type: 'all',
      searchQuery,
    });
  }, [
    allEvents,
    unitFilter,
    monthFilter,
    sectorFilter,
    processFilter,
    groupFilter,
    machineFilter,
    motivoFilter,
    searchQuery,
  ]);

  const monthlyAnalytics = useMemo(() => {
    const eventsForMonthly = filterDowntimeEvents(allEvents, {
      unit: unitFilter,
      month: 'all',
      sector: sectorFilter,
      process: processFilter,
      group: groupFilter,
      machine: machineFilter,
      motivo: motivoFilter,
      type: typeFilter,
      searchQuery,
    });
    return computeDowntimeAnalytics(eventsForMonthly);
  }, [allEvents, unitFilter, sectorFilter, processFilter, groupFilter, machineFilter, motivoFilter, typeFilter, searchQuery]);

  const voidCountInView = useMemo(
    () => voidViewEvents.filter((e) => e.isVacio).length,
    [voidViewEvents]
  );

  const hasActiveFilters =
    unitFilter !== 'all' ||
    monthFilter !== 'all' ||
    sectorFilter !== 'all' ||
    processFilter !== 'all' ||
    groupFilter !== 'all' ||
    machineFilter !== 'all' ||
    motivoFilter !== 'all' ||
    typeFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const resetFilters = () => {
    setUnitFilter('all');
    setMonthFilter('all');
    setSectorFilter('all');
    setProcessFilter('all');
    setGroupFilter('all');
    setMachineFilter('all');
    setMotivoFilter('all');
    setTypeFilter('all');
    setSearchQuery('');
  };

  const handleUnitFilterChange = (nextUnit: string) => {
    setUnitFilter(nextUnit);
    if (nextUnit === 'all') return;

    const unitHasData = filterDowntimeEvents(allEvents, { unit: nextUnit }).length > 0;
    if (!unitHasData) return;

    let nextType = typeFilter;
    let nextMachine = machineFilter;
    let nextGroup = groupFilter;
    let nextProcess = processFilter;
    let nextSector = sectorFilter;
    let nextMonth = monthFilter;
    let nextMotivo = motivoFilter;

    const countWith = () =>
      filterDowntimeEvents(allEvents, {
        unit: nextUnit,
        month: nextMonth,
        sector: nextSector,
        process: nextProcess,
        group: nextGroup,
        machine: nextMachine,
        motivo: nextMotivo,
        type: nextType,
        searchQuery,
      }).length;

    if (countWith() === 0 && nextMachine !== 'all') {
      nextMachine = 'all';
      setMachineFilter('all');
    }
    if (countWith() === 0 && nextGroup !== 'all') {
      nextGroup = 'all';
      setGroupFilter('all');
    }
    if (countWith() === 0 && nextMotivo !== 'all') {
      nextMotivo = 'all';
      setMotivoFilter('all');
    }
    if (countWith() === 0 && nextType !== 'all') {
      nextType = 'all';
      setTypeFilter('all');
    }
    if (countWith() === 0 && nextProcess !== 'all') {
      nextProcess = 'all';
      setProcessFilter('all');
    }
    if (countWith() === 0 && nextSector !== 'all') {
      nextSector = 'all';
      setSectorFilter('all');
    }
    if (countWith() === 0 && nextMonth !== 'all') {
      nextMonth = 'all';
      setMonthFilter('all');
    }
  };

  const handleProcessFilterChange = (nextProc: string) => {
    setProcessFilter(nextProc);
    if (nextProc === 'all') return;

    const norm = nextProc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isQuemadoProc = norm.includes('quemado') || norm.includes('horno') || norm.includes('coccion');
    const isParadaProc = norm.includes('prens') || norm.includes('esmalt') || norm.includes('clasif') || norm.includes('secad');

    let nextType = typeFilter;
    if (isQuemadoProc && nextType === 'paradas') {
      nextType = 'all';
      setTypeFilter('all');
    } else if (isParadaProc && nextType === 'vacios') {
      nextType = 'all';
      setTypeFilter('all');
    }

    const procHasData = filterDowntimeEvents(allEvents, { process: nextProc }).length > 0;
    if (!procHasData) return;

    let nextMachine = machineFilter;
    let nextGroup = groupFilter;
    let nextUnit = unitFilter;
    let nextSector = sectorFilter;
    let nextMotivo = motivoFilter;

    const countWith = () =>
      filterDowntimeEvents(allEvents, {
        unit: nextUnit,
        month: monthFilter,
        sector: nextSector,
        process: nextProc,
        group: nextGroup,
        machine: nextMachine,
        motivo: nextMotivo,
        type: nextType,
        searchQuery,
      }).length;

    if (countWith() === 0 && nextType !== 'all') {
      nextType = 'all';
      setTypeFilter('all');
    }
    if (countWith() === 0 && nextMachine !== 'all') {
      nextMachine = 'all';
      setMachineFilter('all');
    }
    if (countWith() === 0 && nextGroup !== 'all') {
      nextGroup = 'all';
      setGroupFilter('all');
    }
    if (countWith() === 0 && nextMotivo !== 'all') {
      nextMotivo = 'all';
      setMotivoFilter('all');
    }
    if (countWith() === 0 && nextUnit !== 'all') {
      nextUnit = 'all';
      setUnitFilter('all');
    }
    if (countWith() === 0 && nextSector !== 'all') {
      nextSector = 'all';
      setSectorFilter('all');
    }
  };

  const handleGroupFilterChange = (nextGroup: string) => {
    setGroupFilter(nextGroup);
    if (nextGroup === 'all') return;
    if (
      filterDowntimeEvents(allEvents, { group: nextGroup }).length > 0 &&
      filterDowntimeEvents(allEvents, {
        unit: unitFilter,
        month: monthFilter,
        sector: sectorFilter,
        process: processFilter,
        group: nextGroup,
        machine: machineFilter,
        motivo: motivoFilter,
        type: typeFilter,
        searchQuery,
      }).length === 0
    ) {
      if (
        unitFilter !== 'all' &&
        filterDowntimeEvents(allEvents, {
          unit: 'all',
          month: monthFilter,
          sector: sectorFilter,
          process: processFilter,
          group: nextGroup,
          machine: machineFilter,
          motivo: motivoFilter,
          type: typeFilter,
          searchQuery,
        }).length > 0
      ) {
        setUnitFilter('all');
      }
    }
  };

  const handleMachineFilterChange = (nextMachine: string) => {
    setMachineFilter(nextMachine);
    if (nextMachine === 'all') return;
    if (
      filterDowntimeEvents(allEvents, { machine: nextMachine }).length > 0 &&
      filterDowntimeEvents(allEvents, {
        unit: unitFilter,
        month: monthFilter,
        sector: sectorFilter,
        process: processFilter,
        group: groupFilter,
        machine: nextMachine,
        motivo: motivoFilter,
        type: typeFilter,
        searchQuery,
      }).length === 0
    ) {
      if (
        unitFilter !== 'all' &&
        filterDowntimeEvents(allEvents, {
          unit: 'all',
          month: monthFilter,
          sector: sectorFilter,
          process: processFilter,
          group: groupFilter,
          machine: nextMachine,
          motivo: motivoFilter,
          type: typeFilter,
          searchQuery,
        }).length > 0
      ) {
        setUnitFilter('all');
      }
    }
  };

  const handleMotivoFilterChange = (nextMotivo: string) => {
    setMotivoFilter(nextMotivo);
    if (nextMotivo === 'all') return;

    const motivoHasData = filterDowntimeEvents(allEvents, { motivo: nextMotivo }).length > 0;
    if (!motivoHasData) return;

    let nextType = typeFilter;
    let nextMachine = machineFilter;
    let nextGroup = groupFilter;
    let nextProcess = processFilter;
    let nextUnit = unitFilter;
    let nextSector = sectorFilter;

    const countWith = () =>
      filterDowntimeEvents(allEvents, {
        unit: nextUnit,
        month: monthFilter,
        sector: nextSector,
        process: nextProcess,
        group: nextGroup,
        machine: nextMachine,
        motivo: nextMotivo,
        type: nextType,
        searchQuery,
      }).length;

    if (countWith() === 0 && nextType !== 'all') {
      nextType = 'all';
      setTypeFilter('all');
    }
    if (countWith() === 0 && nextMachine !== 'all') {
      nextMachine = 'all';
      setMachineFilter('all');
    }
    if (countWith() === 0 && nextGroup !== 'all') {
      nextGroup = 'all';
      setGroupFilter('all');
    }
    if (countWith() === 0 && nextProcess !== 'all') {
      nextProcess = 'all';
      setProcessFilter('all');
    }
    if (countWith() === 0 && nextUnit !== 'all') {
      nextUnit = 'all';
      setUnitFilter('all');
    }
    if (countWith() === 0 && nextSector !== 'all') {
      nextSector = 'all';
      setSectorFilter('all');
    }
  };

  const handleTypeFilterChange = (nextType: EventTypeFilter) => {
    setTypeFilter(nextType);
    if (processFilter !== 'all') {
      const norm = processFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isQuemadoProc = norm.includes('quemado') || norm.includes('horno') || norm.includes('coccion');
      const isParadaProc = norm.includes('prens') || norm.includes('esmalt') || norm.includes('clasif') || norm.includes('secad');
      if (nextType === 'paradas' && isQuemadoProc) {
        setProcessFilter('all');
      } else if (nextType === 'vacios' && isParadaProc) {
        setProcessFilter('all');
      }
    }
  };

  const handleParsedFile = (result: CsvParseResult, mode: 'replace' | 'append') => {
    setBatches((prev) => (mode === 'replace' ? [result] : [...prev, result]));
    resetFilters();
    setActiveView('resumen');
  };

  const handleRemoveBatch = (batchId: string) => {
    setBatches((prev) => {
      const next = prev.filter((b) => b.batchId !== batchId);
      if (next.length === 0) {
        setActiveView('carga');
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setBatches([]);
    resetFilters();
    setActiveView('carga');
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CERAMIC_PLANT_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sap_paradas_horno_planta_ceramica.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFilteredCsv = () => {
    if (filteredEvents.length === 0) return;
    const headers = [
      'CENTRO',
      'MAQUINA',
      'TURNO',
      'FECHA SAP',
      'PROCESO',
      'GRUPO',
      'MOTIVO',
      'FECHA FIN',
      'DURACION',
      'PRODUCTO',
      'NUMERO DE AVISO SAP',
      'OBSERVACIONES',
    ];
    const csvRows = [
      headers.join(';'),
      ...filteredEvents.map((ev) =>
        [
          ev.centro,
          ev.maquina,
          ev.turno,
          ev.fechaSap,
          ev.proceso,
          ev.grupo,
          ev.motivo,
          ev.fechaFin,
          ev.duracionMinutos,
          ev.producto,
          ev.numeroAvisoSap,
          `"${(ev.observaciones || '').replace(/"/g, '""')}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `paradas_filtradas_kilnpulse_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const lastBatch = batches.length > 0 ? batches[batches.length - 1] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="no-print w-full lg:w-64 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col justify-between">
        <div>
          <div className="flex h-16 items-center gap-2.5 px-6 border-b border-slate-200">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect x="2" y="3" width="20" height="18" rx="4" stroke="#1d4ed8" strokeWidth="1.75" />
              <path
                d="M5 13h3l2-5 3 8 2-4h4"
                stroke="#d97706"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              KilnPulse
            </span>
          </div>

          <nav aria-label="Navegación principal" className="p-4 flex lg:flex-col gap-1 overflow-x-auto">
            <button
              type="button"
              disabled={allEvents.length === 0}
              onClick={() => setActiveView('resumen')}
              className={`flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                activeView === 'resumen'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <BarChart3 className={`h-4 w-4 shrink-0 ${activeView === 'resumen' ? 'text-blue-700' : ''}`} aria-hidden="true" />
                <span>Resumen Ejecutivo</span>
              </span>
              {allEvents.length > 0 && (
                <span className="hidden lg:inline font-mono text-xs tabular-nums text-slate-400">
                  {filteredEvents.length}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={allEvents.length === 0}
              onClick={() => setActiveView('vacios')}
              className={`flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                activeView === 'vacios'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Flame className={`h-4 w-4 shrink-0 ${activeView === 'vacios' ? 'text-amber-600' : ''}`} aria-hidden="true" />
                <span>Vacíos de Horno</span>
              </span>
              {voidCountInView > 0 && (
                <span className="hidden lg:inline font-mono text-xs tabular-nums text-amber-700">
                  {voidCountInView}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={allEvents.length === 0}
              onClick={() => setActiveView('mensual')}
              className={`flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                activeView === 'mensual'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <CalendarRange className={`h-4 w-4 shrink-0 ${activeView === 'mensual' ? 'text-blue-700' : ''}`} aria-hidden="true" />
                <span>Comparativa Mes vs Mes</span>
              </span>
              {monthlyAnalytics.monthlyComparison.length > 0 && (
                <span className="hidden lg:inline font-mono text-xs tabular-nums text-slate-400">
                  {monthlyAnalytics.monthlyComparison.length}m
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={allEvents.length === 0}
              onClick={() => setActiveView('eventos')}
              className={`flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                activeView === 'eventos'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ListFilter className={`h-4 w-4 shrink-0 ${activeView === 'eventos' ? 'text-blue-700' : ''}`} aria-hidden="true" />
                <span>Eventos y Observaciones</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('carga')}
              className={`flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'carga'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Upload className={`h-4 w-4 shrink-0 ${activeView === 'carga' ? 'text-blue-700' : ''}`} aria-hidden="true" />
                <span>Cargar Archivos</span>
              </span>
              {batches.length > 0 && (
                <span className="hidden lg:inline font-mono text-xs tabular-nums text-slate-400">
                  {batches.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="hidden lg:block px-6 py-5 border-t border-slate-100 space-y-1.5">
          <p className="text-xs font-semibold text-slate-900">
            Planta Cerámica · SAP Tiempos Muertos
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-500">
            {batches.length} {batches.length === 1 ? 'archivo activo' : 'archivos activos'} ·{' '}
            {allEvents.length.toLocaleString('es-AR')} eventos
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="no-print h-16 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 whitespace-nowrap shrink-0">Planta Cerámica</span>
            <span className="text-slate-300" aria-hidden="true">/</span>
            <span className="font-medium text-slate-900 truncate">
              {activeView === 'resumen'
                ? 'Análisis de Paradas y Vacíos'
                : activeView === 'vacios'
                  ? 'Minutos de Vacíos de Horno (Quemado)'
                  : activeView === 'mensual'
                    ? 'Comparativa Mes vs Mes'
                    : activeView === 'eventos'
                      ? 'Registro Detallado y Observaciones'
                      : 'Carga de Archivos SAP'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {allEvents.length > 0 ? (
              <button
                type="button"
                onClick={handlePrintPdf}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-md bg-blue-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                <span>Exportar Informe PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadSample}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <span>Descargar CSV de Ejemplo</span>
              </button>
            )}
          </div>
        </header>

        {/* Print-only Executive Report Header */}
        <div className="hidden print-only border-b border-slate-300 px-8 py-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Informe Ejecutivo de Tiempos Muertos — Paradas y Vacíos
              </h1>
              <p className="mt-1 text-xs text-slate-600">
                Fabricación de Pisos y Revestimientos Cerámicos · Fuente: Exportación SAP
              </p>
            </div>
            <div className="text-right font-mono text-xs text-slate-600">
              <div>Generado: {new Date().toLocaleDateString('es-AR')}</div>
              <div>Eventos analizados: {filteredEvents.length}</div>
            </div>
          </div>
        </div>

        <main className="flex-1 px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Global Filter Bar (2-Tier Clean Hierarchy) */}
            {allEvents.length > 0 && activeView !== 'carga' && (
              <section
                aria-label="Filtros del análisis"
                className="no-print rounded-lg border border-slate-200 bg-white p-4 space-y-3.5"
              >
                {/* Tier 1: Classification segmented toggle + live scope readout + actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
                      {(
                        [
                          { id: 'all', label: 'Todos (Paradas y Vacíos)' },
                          { id: 'vacios', label: 'Solo Vacíos (Quemado)' },
                          { id: 'paradas', label: 'Solo Paradas (Prensa/Esmalte)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleTypeFilterChange(opt.id)}
                          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            typeFilter === opt.id
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {filteredEvents.length.toLocaleString('es-AR')} eventos ·{' '}
                      {analytics.totalMinutes.toLocaleString('es-AR')} min ({formatMinutesAsHours(analytics.totalMinutes)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Limpiar filtros</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveView('carga')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Upload className="h-3 w-3 text-slate-500" aria-hidden="true" />
                      <span>Subir otro archivo</span>
                    </button>
                  </div>
                </div>

                {/* Tier 2: Labeled filter controls including Motivo / Código */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5 pt-2.5 border-t border-slate-100">
                  {unitOptions.length > 0 && (
                    <div className="space-y-1">
                      <label htmlFor="filter-unit" className="block text-xs font-medium text-slate-500">
                        Línea / Unidad
                      </label>
                      <select
                        id="filter-unit"
                        value={unitFilter}
                        onChange={(e) => handleUnitFilterChange(e.target.value)}
                        className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                          unitFilter !== 'all'
                            ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                            : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <option value="all">Todas ({unitOptions.length})</option>
                        {unitOptions.map((u) => {
                          const c = contextualCounts.units.get(u.toLowerCase()) ?? 0;
                          return (
                            <option key={u} value={u}>
                              {u} ({c})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label htmlFor="filter-month" className="block text-xs font-medium text-slate-500">
                      Mes
                    </label>
                    <select
                      id="filter-month"
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        monthFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todos los meses</option>
                      {filterOptions.months.map((m) => {
                        const c = contextualCounts.months.get(m.toLowerCase()) ?? 0;
                        return (
                          <option key={m} value={m}>
                            {formatMonthLabel(m)} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="filter-sector" className="block text-xs font-medium text-slate-500">
                      Planta / Sector
                    </label>
                    <select
                      id="filter-sector"
                      value={sectorFilter}
                      onChange={(e) => setSectorFilter(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        sectorFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todos los sectores</option>
                      {filterOptions.sectors.map((s) => {
                        const c = contextualCounts.sectors.get(s.toLowerCase()) ?? 0;
                        return (
                          <option key={s} value={s}>
                            {s} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="filter-process" className="block text-xs font-medium text-slate-500">
                      Proceso
                    </label>
                    <select
                      id="filter-process"
                      value={processFilter}
                      onChange={(e) => handleProcessFilterChange(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        processFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todos los procesos</option>
                      {filterOptions.processes.map((p) => {
                        const c = contextualCounts.processes.get(p.toLowerCase()) ?? 0;
                        return (
                          <option key={p} value={p}>
                            {p} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="filter-group" className="block text-xs font-medium text-slate-500">
                      Grupo
                    </label>
                    <select
                      id="filter-group"
                      value={groupFilter}
                      onChange={(e) => handleGroupFilterChange(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        groupFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todos los grupos</option>
                      {filterOptions.groups.map((g) => {
                        const c = contextualCounts.groups.get(g.toLowerCase()) ?? 0;
                        return (
                          <option key={g} value={g}>
                            {g} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="filter-machine" className="block text-xs font-medium text-slate-500">
                      Máquina
                    </label>
                    <select
                      id="filter-machine"
                      value={machineFilter}
                      onChange={(e) => handleMachineFilterChange(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        machineFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todas las máquinas</option>
                      {filterOptions.machines.map((m) => {
                        const c = contextualCounts.machines.get(m.toLowerCase()) ?? 0;
                        return (
                          <option key={m} value={m}>
                            {m} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="filter-motivo" className="block text-xs font-medium text-slate-500">
                      Motivo / Código
                    </label>
                    <select
                      id="filter-motivo"
                      value={motivoFilter}
                      onChange={(e) => handleMotivoFilterChange(e.target.value)}
                      className={`h-8 w-full rounded-md border px-2.5 text-xs focus:border-blue-700 focus:outline-none ${
                        motivoFilter !== 'all'
                          ? 'border-blue-400 bg-blue-50/40 font-medium text-blue-900'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <option value="all">Todos los motivos ({filterOptions.motivos.length})</option>
                      {filterOptions.motivos.map((mot) => {
                        const c = contextualCounts.motivos.get(mot.toLowerCase()) ?? 0;
                        return (
                          <option key={mot} value={mot}>
                            {mot} ({c})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </section>
            )}

            {/* Diagnostic Alert when combined filters yield 0 events or 0 minutes */}
            {allEvents.length > 0 &&
              activeView !== 'carga' &&
              (filteredEvents.length === 0 || analytics.totalMinutes === 0) && (
                <section
                  aria-label="Diagnóstico de filtros sin resultados"
                  className="no-print rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-amber-950">
                          {filteredEvents.length === 0
                            ? 'La combinación exacta de filtros seleccionados no tiene eventos coincidentes (0 registros).'
                            : `Se encontraron ${filteredEvents.length} eventos en la selección, pero su duración acumulada suma 0 minutos.`}
                        </p>
                        <p className="mt-0.5 text-amber-800">
                          {filteredEvents.length === 0
                            ? 'Cada filtro individual puede existir por separado en el archivo, pero alguno de ellos (por ej. Grupo, Máquina, Mes o el toggle Paradas/Vacíos) excluye al resto. Quitá alguno con un clic para ver los datos:'
                            : `Revisá los valores en la columna DURACION de tu archivo (muestras encontradas: ${filteredEvents
                                .slice(0, 4)
                                .map((e) => `"${e.duracionRaw || 'vacío'}"`)
                                .join(', ')}).`}
                        </p>
                      </div>
                    </div>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Restablecer todo</span>
                      </button>
                    )}
                  </div>

                  {hasActiveFilters && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {typeFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setTypeFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Tipo: {typeFilter === 'vacios' ? 'Solo Vacíos' : 'Solo Paradas'}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {unitFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setUnitFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Línea: {unitFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {monthFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setMonthFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Mes: {formatMonthLabel(monthFilter)}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {sectorFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setSectorFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Sector: {sectorFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {processFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setProcessFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Proceso: {processFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {groupFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setGroupFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Grupo: {groupFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {machineFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setMachineFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Máquina: {machineFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                      {motivoFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setMotivoFilter('all')}
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-amber-100"
                        >
                          <span>Motivo: {motivoFilter}</span>
                          <X className="h-3 w-3 text-slate-500" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              )}

            {/* Views */}
            {activeView === 'resumen' && allEvents.length > 0 && (
              <ExecutiveDashboard
                analytics={analytics}
                unitOptions={unitOptions}
                selectedUnit={unitFilter}
                onSelectUnit={handleUnitFilterChange}
                selectedGroup={groupFilter}
                onSelectGroup={(g) => handleGroupFilterChange(groupFilter.toLowerCase() === g.toLowerCase() ? 'all' : g)}
                selectedMachine={machineFilter}
                onSelectMachine={(m) => handleMachineFilterChange(machineFilter.toLowerCase() === m.toLowerCase() ? 'all' : m)}
                selectedMotivo={motivoFilter}
                onSelectMotivo={(mot) => handleMotivoFilterChange(motivoFilter.toLowerCase() === mot.toLowerCase() ? 'all' : mot)}
                selectedSector={sectorFilter}
                typeFilter={typeFilter}
                onChangeTypeFilter={handleTypeFilterChange}
                onResetFilters={resetFilters}
              />
            )}

            {activeView === 'vacios' && allEvents.length > 0 && (
              <VoidsAnalysisView events={voidViewEvents} analytics={analytics} />
            )}

            {activeView === 'mensual' && allEvents.length > 0 && (
              <MonthlyComparisonView months={monthlyAnalytics.monthlyComparison} />
            )}

            {activeView === 'eventos' && allEvents.length > 0 && (
              <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-slate-900">
                      Registro de Paradas y Vacíos con Observaciones ({filteredEvents.length.toLocaleString('es-AR')})
                    </h2>
                    <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-500">
                      {analytics.totalMinutes.toLocaleString('es-AR')} min ({formatMinutesAsHours(analytics.totalMinutes)}) acumulados ·{' '}
                      Vacíos: {analytics.vacioMinutes.toLocaleString('es-AR')} min · Paradas: {analytics.paradaMinutes.toLocaleString('es-AR')} min
                    </p>
                  </div>

                  <div className="flex items-center gap-3 no-print">
                    <button
                      type="button"
                      onClick={handleExportFilteredCsv}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Exportar CSV Filtrado</span>
                    </button>

                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar máquina, motivo, aviso..."
                        aria-label="Buscar en eventos"
                        className="h-9 w-60 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-2.5 pl-5 pr-3 font-medium whitespace-nowrap">Fecha SAP</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Tipo</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Sector</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Máquina</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Proceso</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Grupo</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Motivo</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Turno</th>
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">Aviso SAP</th>
                        <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Duración</th>
                        <th className="py-2.5 pl-3 pr-5 font-medium">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedFilteredEvents.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-5 py-8 text-center text-sm text-slate-500">
                            Ningún evento coincide con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedFilteredEvents.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50">
                            <td className="py-2.5 pl-5 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {ev.fechaSap || '—'}
                            </td>
                            <td
                              className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                                ev.isVacio ? 'text-amber-700' : 'text-blue-700'
                              }`}
                            >
                              {ev.isVacio ? 'Vacío' : 'Parada'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {ev.centro || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                              {ev.maquina || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {ev.proceso || '—'}
                            </td>
                            <td
                              className={`py-2.5 px-3 font-medium whitespace-nowrap ${
                                ev.isVacio ? 'text-amber-800' : 'text-slate-700'
                              }`}
                            >
                              {ev.grupo || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800 max-w-[220px]">
                              {ev.motivo || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              {ev.turno || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {ev.numeroAvisoSap || '—'}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                ev.isVacio ? 'text-amber-800' : 'text-slate-900'
                              }`}
                            >
                              {ev.duracionMinutos.toLocaleString('es-AR')} min
                            </td>
                            <td className="py-2.5 pl-3 pr-5 text-slate-600 max-w-[300px]">
                              {ev.observaciones || <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredEvents.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                          <td colSpan={9} className="py-2.5 pl-5 pr-3">
                            Total del filtro ({filteredEvents.length.toLocaleString('es-AR')} eventos)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {analytics.totalMinutes.toLocaleString('es-AR')} min
                          </td>
                          <td className="py-2.5 pl-3 pr-5 font-mono text-xs tabular-nums text-slate-600">
                            {formatMinutesAsHours(analytics.totalMinutes)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {eventsTotalPages > 1 && (
                  <div className="no-print border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-4 text-xs text-slate-600">
                    <span className="font-mono tabular-nums">
                      Página {safeEventsPage} de {eventsTotalPages} · Mostrando{' '}
                      {(safeEventsPage - 1) * EVENTS_PAGE_SIZE + 1}–
                      {Math.min(safeEventsPage * EVENTS_PAGE_SIZE, filteredEvents.length)} de{' '}
                      {filteredEvents.length.toLocaleString('es-AR')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeEventsPage <= 1}
                        onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        disabled={safeEventsPage >= eventsTotalPages}
                        onClick={() => setEventsPage((p) => Math.min(eventsTotalPages, p + 1))}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Upload & Batch Management View */}
            {activeView === 'carga' && (
              <div className="space-y-8">
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
                    Análisis de Tiempos Muertos, Paradas y Vacíos de Horno
                  </h1>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Cargá tu exportación de SAP (.csv, .xlsx, .xls o .json). Al seleccionar "Todos (Paradas y Vacíos)", la app acumula e integra todos los minutos de la planta (incluyendo vacíos de horno y paradas de prensa/esmaltado).
                  </p>
                </div>

                <CsvDropZone
                  onParsed={handleParsedFile}
                  onClearAll={handleClearAll}
                  activeBatchesCount={batches.length}
                  lastParsedResult={lastBatch}
                />

                {batches.length > 0 && (
                  <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">
                          Archivos Guardados en Memoria Local ({batches.length})
                        </h2>
                        <p className="text-xs text-slate-500">
                          Podés cargar archivos día a día o mes a mes para compararlos en el tiempo
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveView('resumen')}
                        className="rounded-md bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                      >
                        Ir al Resumen Ejecutivo
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {batches.map((b) => (
                        <div
                          key={b.batchId}
                          className="flex items-center justify-between gap-4 px-5 py-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileSpreadsheet
                              className="h-4 w-4 shrink-0 text-slate-400"
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{b.fileName}</p>
                              <p className="font-mono tabular-nums text-slate-500">
                                {b.totalRows} eventos ·{' '}
                                {b.schemaReport.matchedCoreColumns.length}/12 cols SAP ·{' '}
                                {b.schemaReport.ignoredAuditColumns.length} audit omitidas
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveBatch(b.batchId)}
                            aria-label={`Eliminar archivo ${b.fileName}`}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Quitar</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="rounded-lg border border-slate-200 bg-white p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800">
                        Columnas SAP Analizadas ({CORE_SAP_COLUMNS.length})
                      </h3>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-slate-600">
                        {CORE_SAP_COLUMNS.join(' · ')}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800">
                        Columnas Descartadas Automáticamente ({IGNORED_SAP_AUDIT_COLUMNS.length})
                      </h3>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-slate-500">
                        {IGNORED_SAP_AUDIT_COLUMNS.join(' · ')}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
