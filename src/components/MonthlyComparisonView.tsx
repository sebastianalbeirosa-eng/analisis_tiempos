import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarRange } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MonthlyComparisonRow } from '../types/csv';
import { formatMinutesAsHours } from '../utils/downtimeAnalytics';

interface MonthlyComparisonViewProps {
  months: MonthlyComparisonRow[];
}

export const MonthlyComparisonView: React.FC<MonthlyComparisonViewProps> = ({ months }) => {
  const [unitScale, setUnitScale] = useState<'minutes' | 'hours'>('minutes');

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        monthLabel: m.monthLabel,
        vacios:
          unitScale === 'minutes'
            ? m.vacioMinutes
            : Math.round((m.vacioMinutes / 60) * 10) / 10,
        paradas:
          unitScale === 'minutes'
            ? m.paradaMinutes
            : Math.round((m.paradaMinutes / 60) * 10) / 10,
        total:
          unitScale === 'minutes'
            ? m.totalMinutes
            : Math.round((m.totalMinutes / 60) * 10) / 10,
      })),
    [months, unitScale]
  );

  const totals = useMemo(() => {
    const totalCount = months.reduce((acc, m) => acc + m.totalCount, 0);
    const vacioMinutes = Math.round(months.reduce((acc, m) => acc + m.vacioMinutes, 0) * 10) / 10;
    const paradaMinutes = Math.round(months.reduce((acc, m) => acc + m.paradaMinutes, 0) * 10) / 10;
    const totalMinutes = Math.round(months.reduce((acc, m) => acc + m.totalMinutes, 0) * 10) / 10;
    return { totalCount, vacioMinutes, paradaMinutes, totalMinutes };
  }, [months]);

  if (months.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <CalendarRange className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 font-display text-sm font-semibold text-slate-900">
          Sin fechas válidas para comparar meses
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Asegurate de que el archivo contenga la columna FECHA SAP con formato válido (DD/MM/AAAA o AAAA-MM-DD) para habilitar la comparativa mes vs mes.
        </p>
      </section>
    );
  }

  const maxMinutes = Math.max(1, ...months.map((m) => m.totalMinutes));
  const unitSuffix = unitScale === 'minutes' ? 'min' : 'h';

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Evolución Mensual: Paradas vs Vacíos de Horno
            </h2>
            <p className="text-xs text-slate-500">
              Comparativa histórica acumulada ({months.length}{' '}
              {months.length === 1 ? 'mes detectado' : 'meses detectados'}) ·{' '}
              {totals.totalMinutes.toLocaleString('es-AR')} min ({formatMinutesAsHours(totals.totalMinutes)}) totales
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setUnitScale('minutes')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                unitScale === 'minutes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Minutos
            </button>
            <button
              type="button"
              onClick={() => setUnitScale('hours')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                unitScale === 'hours'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Horas
            </button>
          </div>
        </div>

        {/* Comparative Recharts BarChart */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.06)',
                }}
                formatter={(val, name) => [
                  `${Number(val ?? 0).toLocaleString('es-AR')} ${unitSuffix}`,
                  name === 'vacios' ? 'Vacíos (Quemado)' : 'Paradas (Prensa/Esmalte)',
                ]}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                iconType="square"
                iconSize={10}
                formatter={(val) => (
                  <span className="text-xs text-slate-600">
                    {val === 'vacios' ? 'Vacíos (Quemado)' : 'Paradas (Prensa/Esmalte)'}
                  </span>
                )}
              />
              <Bar dataKey="vacios" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="paradas" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Month-over-month stacked progress bars with % delta */}
        <div className="border-t border-slate-100 pt-5 space-y-4">
          {months.map((m) => {
            const vacioPct = (m.vacioMinutes / maxMinutes) * 100;
            const paradaPct = (m.paradaMinutes / maxMinutes) * 100;

            return (
              <div key={m.monthKey} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{m.monthLabel}</span>
                    {m.deltaMinutesPercent !== null && (
                      <span
                        className={`inline-flex items-center gap-0.5 font-mono tabular-nums font-medium ${
                          m.deltaMinutesPercent > 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {m.deltaMinutesPercent > 0 ? (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {m.deltaMinutesPercent > 0 ? '+' : ''}
                        {m.deltaMinutesPercent.toFixed(1)}% vs mes ant.
                      </span>
                    )}
                  </div>
                  <div className="font-mono tabular-nums text-slate-700">
                    {m.totalMinutes.toLocaleString('es-AR')} min ({formatMinutesAsHours(m.totalMinutes)}) ·{' '}
                    {m.totalCount} eventos
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-xs bg-slate-100 overflow-hidden flex">
                  {m.vacioMinutes > 0 && (
                    <div
                      style={{ width: `${vacioPct}%` }}
                      className="h-full bg-amber-500"
                      title={`Vacíos: ${m.vacioMinutes.toLocaleString('es-AR')} min`}
                    />
                  )}
                  {m.paradaMinutes > 0 && (
                    <div
                      style={{ width: `${paradaPct}%` }}
                      className="h-full bg-blue-700"
                      title={`Paradas: ${m.paradaMinutes.toLocaleString('es-AR')} min`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Tabla Comparativa Mes vs Mes
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 pl-5 pr-3 font-medium">Mes</th>
                <th className="py-2.5 px-3 font-medium text-right">Eventos</th>
                <th className="py-2.5 px-3 font-medium text-right">Min. Vacíos</th>
                <th className="py-2.5 px-3 font-medium text-right">Min. Paradas</th>
                <th className="py-2.5 px-3 font-medium text-right">Total Min.</th>
                <th className="py-2.5 px-3 font-medium text-right">Horas</th>
                <th className="py-2.5 px-3 font-medium text-right">Var. %</th>
                <th className="py-2.5 px-3 font-medium">Grupo Dominante</th>
                <th className="py-2.5 px-3 font-medium">Máquina Principal</th>
                <th className="py-2.5 pl-3 pr-5 font-medium">Motivo Preponderante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {months.map((m) => (
                <tr key={m.monthKey} className="h-10 hover:bg-slate-50">
                  <td className="py-2.5 pl-5 pr-3 font-semibold text-slate-900 whitespace-nowrap">
                    {m.monthLabel}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                    {m.totalCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                    {m.vacioMinutes.toLocaleString('es-AR')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">
                    {m.paradaMinutes.toLocaleString('es-AR')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {m.totalMinutes.toLocaleString('es-AR')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {formatMinutesAsHours(m.totalMinutes)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {m.deltaMinutesPercent === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={m.deltaMinutesPercent > 0 ? 'text-red-700' : 'text-emerald-700'}>
                        {m.deltaMinutesPercent > 0 ? '+' : ''}
                        {m.deltaMinutesPercent.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{m.topGrupo}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-900 whitespace-nowrap">
                    {m.topMaquina}
                  </td>
                  <td className="py-2.5 pl-3 pr-5 text-slate-700 max-w-[260px] truncate" title={m.topMotivo}>
                    {m.topMotivo}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <td className="py-2.5 pl-5 pr-3">Total acumulado ({months.length} meses)</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {totals.totalCount}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                  {totals.vacioMinutes.toLocaleString('es-AR')}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700">
                  {totals.paradaMinutes.toLocaleString('es-AR')}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {totals.totalMinutes.toLocaleString('es-AR')}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                  {formatMinutesAsHours(totals.totalMinutes)}
                </td>
                <td colSpan={4} className="py-2.5 px-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
