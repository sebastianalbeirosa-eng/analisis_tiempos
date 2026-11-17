export type CsvDelimiter = ',' | ';' | '\t' | 'xlsx' | 'json';

export type ValidationSeverity = 'error' | 'warning';

export interface RowIssue {
  rowNumber: number;
  column: string;
  severity: ValidationSeverity;
  message: string;
}

export interface SchemaMatchReport {
  detectedHeaders: string[];
  activeHeaders: string[];
  matchedCoreColumns: string[];
  missingCoreColumns: string[];
  ignoredAuditColumns: string[];
  extraColumns: string[];
}

export interface DowntimeEvent {
  id: string;
  batchId: string;
  rowNumber: number;
  centro: string;
  maquina: string;
  turno: string;
  fechaSap: string;
  fechaIso: string | null; // YYYY-MM-DD
  monthKey: string | null; // YYYY-MM
  proceso: string;
  grupo: string;
  motivo: string;
  fechaFin: string;
  duracionMinutos: number;
  duracionRaw: string;
  producto: string;
  numeroAvisoSap: string;
  observaciones: string;
  isVacio: boolean;
  raw: Record<string, string>;
}

export interface CsvParseResult {
  batchId: string;
  fileName: string;
  fileSizeBytes: number;
  delimiter: CsvDelimiter;
  totalRows: number;
  validRowsCount: number;
  headers: string[];
  rows: Record<string, string>[];
  events: DowntimeEvent[];
  schemaReport: SchemaMatchReport;
  issues: RowIssue[];
  parsedAt: string;
  isValid: boolean;
}

export interface CsvFileValidationError {
  code: 'INVALID_TYPE' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'NO_DATA_ROWS' | 'MALFORMED_CSV';
  message: string;
  detail: string;
}

export interface DimensionObservation {
  text: string;
  minutes: number;
  count: number;
  machines?: string[];
  dates?: string[];
  notices?: string[];
}

export interface DimensionBreakdown {
  name: string;
  minutes: number;
  vacioMinutes: number;
  paradaMinutes: number;
  count: number;
  vacioCount: number;
  paradaCount: number;
  sharePercent: number;
  cumulativePercent: number;
  avgMinutes: number;
  avgDailyMinutes: number;
  activeDaysCount?: number;
  sampleNotice?: string;
  sampleObservation?: string;
  topObservations?: DimensionObservation[];
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  label: string;
  totalMinutes: number;
  vacioMinutes: number;
  paradaMinutes: number;
  totalCount: number;
  vacioCount: number;
  paradaCount: number;
}

export interface MonthlyComparisonRow {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  totalMinutes: number;
  vacioMinutes: number;
  paradaMinutes: number;
  totalCount: number;
  vacioCount: number;
  paradaCount: number;
  topGrupo: string;
  topMotivo: string;
  topMaquina: string;
  deltaMinutesPercent: number | null;
}

export interface DowntimeAnalytics {
  totalEvents: number;
  totalMinutes: number;
  vacioEvents: number;
  vacioMinutes: number;
  vacioSharePercent: number;
  paradaEvents: number;
  paradaMinutes: number;
  paradaSharePercent: number;
  avgDurationMinutes: number;
  uniqueDaysCount: number;

  topGrupoByMinutes: DimensionBreakdown | null;
  topGrupoByCount: DimensionBreakdown | null;
  topMotivoByMinutes: DimensionBreakdown | null;
  topMotivoByCount: DimensionBreakdown | null;
  topParadaMotivo: DimensionBreakdown | null;
  topVacioMotivo: DimensionBreakdown | null;
  topMaquinaByMinutes: DimensionBreakdown | null;
  topMaquinaByCount: DimensionBreakdown | null;
  topProcesoByMinutes: DimensionBreakdown | null;
  topSectorByMinutes: DimensionBreakdown | null;
  peakDateByMinutes: DailyMetric | null;
  peakDateByCount: DailyMetric | null;
  peakVacioDate: DailyMetric | null;

  byGrupo: DimensionBreakdown[];
  byMotivo: DimensionBreakdown[];
  byMaquina: DimensionBreakdown[];
  byProceso: DimensionBreakdown[];
  bySector: DimensionBreakdown[];
  byTurno: DimensionBreakdown[];
  byProducto: DimensionBreakdown[];
  dailyTimeline: DailyMetric[];
  monthlyComparison: MonthlyComparisonRow[];
}
