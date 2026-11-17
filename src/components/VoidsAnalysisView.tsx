import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Cpu, Download, Flame, Search, Tag } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DowntimeAnalytics, DowntimeEvent } from '../types/csv';
import { computeDowntimeAnalytics, formatMinutesAsHours } from '../utils/downtimeAnalytics';

interface VoidsAnalysisViewProps {
  events: DowntimeEvent[];
  analytics: DowntimeAnalytics;
}

const PAGE_SIZE = 100;

export const VoidsAnalysisView: React.FC<VoidsAnalysisViewProps> = ({ events }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const voidEvents = useMemo(() => events.filter((e) => e.isVacio), [events]);
  const voidAnalytics = useMemo(() => computeDowntimeAnalytics(voidEvents), [voidEvents]);

  const filteredVoidEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const base = q
      ? voidEvents.filter((ev) =>
          [
            ev.fechaSap,
            ev.centro,
            ev.maquina,
            ev.grupo,
            ev.motivo,
            ev.numeroAvisoSap,
            ev.observaciones,
            ev.producto,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : voidEvents;

    return [...base].sort((a, b) => b.duracionMinutos - a.duracionMinutos);
  }, [voidEvents, searchTerm]);

  const totalFilteredMinutes = useMemo(
    () => Math.round(filteredVoidEvents.reduce((acc, ev) => acc + ev.duracionMinutos, 0) * 10) / 10,
    [filteredVoidEvents]
  );

  const totalPages = Math.max(1, Math.ceil(filteredVoidEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedEvents = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredVoidEvents.slice(start, start + PAGE_SIZE);
  }, [filteredVoidEvents, safePage]);

  const topMotivoChartData = useMemo(
    () =>
      voidAnalytics.byMotivo.slice(0, 8).map((m) => ({
        name: m.name.length > 32 ? `${m.name.slice(0, 30)}…` : m.name,
        fullName: m.name,
        minutes: m.minutes,
        count: m.count,
        avgDaily: m.avgDailyMinutes,
      })),
    [voidAnalytics.byMotivo]
  );

  const handleExportVoidsCsv = () => {
    if (filteredVoidEvents.length === 0) return;
    const headers = [
      'FECHA SAP',
      'SECTOR',
      'MAQUINA',
      'PROCESO',
      'GRUPO',
      'MOTIVO',
      'TURNO',
      'AVISO SAP',
      'DURACION MIN',
      'PRODUCTO',
      'OBSERVACIONES',
    ];
    const rows = [
      headers.join(';'),
      ...filteredVoidEvents.map((ev) =>
        [
          ev.fechaSap,
          ev.centro,
          ev.maquina,
          ev.proceso,
          ev.grupo,
          ev.motivo,
          ev.turno,
          ev.numeroAvisoSap,
          ev.duracionMinutos,
          ev.producto,
          `"${(ev.observaciones || '').replace(/"/g, '""')}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vacios_horno_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (voidEvents.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <Flame className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 font-display text-sm font-semibold text-slate-900">
          No se detectaron eventos de vacío en el filtro actual
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Todos los minutos registrados bajo el proceso de Quemado / Horno / Cocción se clasifican automáticamente como vacíos de horno.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unified 4-column KPI Strip */}
      <section
        aria-label="Indicadores de vacíos de horno"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-5">
          <div className="flex items-center justify-between text-xs font-medium text-amber-800">
            <span>Total Minutos de Vacíos</span>
            <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-700">
            {voidAnalytics.totalMinutes.toLocaleString('es-AR')} min
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {formatMinutesAsHours(voidAnalytics.totalMinutes)} · {voidAnalytics.totalEvents} eventos ·{' '}
            {voidAnalytics.avgDurationMinutes.toFixed(1)} min/ev
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Horno / Máquina Más Afectada</span>
            <Cpu className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-base font-semibold text-slate-900 truncate">
            {voidAnalytics.topMaquinaByMinutes?.name ?? '—'}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {(voidAnalytics.topMaquinaByMinutes?.minutes ?? 0).toLocaleString('es-AR')} min ·{' '}
            {voidAnalytics.topMaquinaByMinutes?.count ?? 0} vacíos
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Motivo Principal de Vacío</span>
            <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <p
            className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2"
            title={voidAnalytics.topMotivoByMinutes?.name}
          >
            {voidAnalytics.topMotivoByMinutes?.name ?? '—'}
          </p>
          {voidAnalytics.topMotivoByMinutes?.sampleObservation && (
            <p
              className="mt-1 text-[11px] text-slate-600 line-clamp-2 leading-snug"
              title={voidAnalytics.topMotivoByMinutes.sampleObservation}
            >
              Obs.: {voidAnalytics.topMotivoByMinutes.sampleObservation}
            </p>
          )}
          <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {voidAnalytics.topMotivoByMinutes?.sharePercent.toFixed(1) ?? 0}% ·{' '}
            {(voidAnalytics.topMotivoByMinutes?.avgDailyMinutes ?? 0).toFixed(1)} min/día
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Fecha con Más Vacíos</span>
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-base font-semibold tabular-nums text-slate-900">
            {voidAnalytics.peakDateByMinutes?.date ?? '—'}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {Math.round(voidAnalytics.peakDateByMinutes?.totalMinutes ?? 0).toLocaleString('es-AR')} min ·{' '}
            {voidAnalytics.peakDateByMinutes?.totalCount ?? 0} eventos
          </p>
        </div>
      </section>

      {/* Visual Breakdown Row: Top Void Motifs Chart + Breakdown by Machine/Kiln */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Principales Motivos de Vacío en Horno
              </h2>
              <p className="text-xs text-slate-500">
                Top {topMotivoChartData.length} códigos/motivos ordenados por minutos acumulados en Quemado
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
              {voidAnalytics.byMotivo.length} motivos
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topMotivoChartData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={165}
                  tick={{ fontSize: 11, fill: '#334155' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.06)',
                  }}
                  formatter={(val) => [`${Number(val ?? 0).toLocaleString('es-AR')} min`, 'Vacíos']}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ''
                  }
                />
                <Bar dataKey="minutes" fill="#d97706" radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Vacíos por Horno / Máquina ({voidAnalytics.byMaquina.length})
            </h2>
            <p className="text-xs text-slate-500">
              Participación porcentual y promedio diario por equipo
            </p>
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-80">
            {voidAnalytics.byMaquina.map((item) => (
              <div key={item.name} className="px-5 py-3 space-y-1.5 hover:bg-slate-50/70">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-medium text-slate-900 truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="font-mono tabular-nums text-amber-800 font-semibold whitespace-nowrap">
                    {item.minutes.toLocaleString('es-AR')} min ({item.sharePercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-xs bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, item.sharePercent)}%` }}
                  />
                </div>
                <p className="font-mono text-xs tabular-nums text-slate-500">
                  {item.count} eventos · {item.avgDailyMinutes.toFixed(1)} min/día ·{' '}
                  {formatMinutesAsHours(item.minutes)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Detailed Void Events Table */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Detalle de Eventos de Vacío y Observaciones ({filteredVoidEvents.length})
            </h3>
            <p className="text-xs text-slate-500">
              Ordenados por duración descendente para identificar las pérdidas más críticas en cocción
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
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar horno, motivo, aviso..."
                aria-label="Buscar en eventos de vacío"
                className="h-8 w-56 rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleExportVoidsCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>Exportar Vacíos CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 pl-5 pr-3 font-medium whitespace-nowrap">Fecha SAP</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Sector</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Grupo</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Máquina</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Motivo</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Aviso SAP</th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Duración</th>
                <th className="py-2.5 pl-3 pr-5 font-medium">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-xs text-slate-500">
                    Ningún evento de vacío coincide con la búsqueda &ldquo;{searchTerm}&rdquo;.
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pl-5 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {ev.fechaSap || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{ev.centro || '—'}</td>
                    <td className="py-2.5 px-3 font-medium text-amber-800 whitespace-nowrap">
                      {ev.grupo || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {ev.maquina || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 max-w-[240px]">{ev.motivo || '—'}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {ev.numeroAvisoSap || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-800 whitespace-nowrap">
                      {ev.duracionMinutos.toLocaleString('es-AR')} min
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-slate-600 max-w-[320px]">
                      {ev.observaciones || <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredVoidEvents.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td colSpan={6} className="py-2.5 pl-5 pr-3">
                    Total vacíos mostrados ({filteredVoidEvents.length} eventos)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800 whitespace-nowrap">
                    {totalFilteredMinutes.toLocaleString('es-AR')} min
                  </td>
                  <td className="py-2.5 pl-3 pr-5 font-mono text-xs tabular-nums text-slate-600">
                    {formatMinutesAsHours(totalFilteredMinutes)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div className="no-print border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-4 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Página {safePage} de {totalPages} · Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredVoidEvents.length)} de {filteredVoidEvents.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
