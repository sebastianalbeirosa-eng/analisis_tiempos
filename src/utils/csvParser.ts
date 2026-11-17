import * as XLSX from 'xlsx';
import {
  CsvDelimiter,
  CsvFileValidationError,
  CsvParseResult,
  DowntimeEvent,
  RowIssue,
  SchemaMatchReport,
} from '../types/csv';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const CORE_SAP_COLUMNS = [
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
] as const;

export const IGNORED_SAP_AUDIT_COLUMNS = [
  'AP PV1',
  'AP AP1',
  'AP AP2',
  'CREATED BY',
  'UPDATED BY',
] as const;

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json'];

export function normalizeHeaderName(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function validateUploadFileMeta(file: File): CsvFileValidationError | null {
  const lowerName = file.name.toLowerCase();
  const hasAcceptedExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!hasAcceptedExt) {
    return {
      code: 'INVALID_TYPE',
      message: `Formato no compatible: "${file.name}"`,
      detail:
        'Subí archivos .csv, .xlsx, .xls o .json exportados desde SAP/Excel. Para imágenes o adjuntos visuales, usá archivos de datos tabulares.',
    };
  }

  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      message: `El archivo "${file.name}" está vacío (0 bytes)`,
      detail: 'El archivo no contiene filas ni encabezados. Exportá nuevamente el reporte e intentá otra vez.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `"${file.name}" supera el límite de 25 MB`,
      detail: `El tamaño actual es ${(file.size / (1024 * 1024)).toFixed(2)} MB. Dividí la exportación por mes o por línea.`,
    };
  }

  return null;
}

export function detectDelimiter(sampleText: string): ',' | ';' | '\t' {
  const firstLines = sampleText
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 12);

  if (firstLines.length === 0) {
    return ';';
  }

  const candidates: Array<';' | ',' | '\t'> = [';', ',', '\t'];
  let bestDelimiter: ',' | ';' | '\t' = ';';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = firstLines.map((line) => countUnquotedDelimiter(line, delimiter));
    const nonZeroCounts = counts.filter((c) => c > 0);
    if (nonZeroCounts.length === 0) continue;

    // Frequency of the mode count among non-zero lines measures tabular consistency
    const freqMap = new Map<number, number>();
    for (const c of nonZeroCounts) {
      freqMap.set(c, (freqMap.get(c) ?? 0) + 1);
    }
    const maxConsistency = Math.max(...freqMap.values());
    const totalCount = nonZeroCounts.reduce((acc, val) => acc + val, 0);
    const score = maxConsistency * 1000 + totalCount;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function countUnquotedDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

export function parseCsvMatrix(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\r' && nextChar === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i += 1;
    } else if (char === '\n' || char === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function deduplicateHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((header, index) => {
    const base = String(header ?? '').trim() || `COLUMNA_${index + 1}`;
    const normalized = normalizeHeaderName(base);
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    if (count === 0) {
      return base;
    }
    return `${base} (${count + 1})`;
  });
}

export function isValidDurationValue(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^[\d.,\s]+(\s*(min|mins|minutos|m|'|h|hs|hr|hrs|hora|horas)\.?)?$/i.test(trimmed)) return true;
  if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(trimmed)) return true;
  return false;
}

export function parseDurationToMinutes(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const parts = trimmed.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  }

  const isHours = /\b(h|hs|hr|hrs|hora|horas)\.?$/i.test(trimmed);
  let numStr = trimmed
    .replace(/\s*(min|mins|minutos|m|'|h|hs|hr|hrs|hora|horas)\.?$/i, '')
    .replace(/\s+/g, '');

  // Spanish/LatAm thousands with decimal comma: 1.250,50 -> 1250.50
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(numStr)) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(numStr)) {
    // US thousands with decimal dot: 1,250.50 -> 1250.50
    numStr = numStr.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(numStr)) {
    // Spanish integer thousands: 1.440 -> 1440
    numStr = numStr.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(numStr)) {
    // US integer thousands: 1,440 -> 1440
    numStr = numStr.replace(/,/g, '');
  } else {
    numStr = numStr.replace(',', '.');
  }

  const normalized = Number(numStr);
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return isHours ? normalized * 60 : normalized;
}

function parseFullTimestamp(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Match YYYY-MM-DD HH:MM(:SS)
  let m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  }
  // Match DD/MM/YYYY HH:MM(:SS)
  m = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const y = m[3].length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  }
  return null;
}

export function parseSapDateToIso(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Compact SAP format: YYYYMMDD
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:\s|$)/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY (typical SAP/ES export)
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

function findColumnValue(
  rowObj: Record<string, string>,
  activeHeaders: string[],
  aliases: string[]
): string {
  for (const alias of aliases) {
    const foundHeader = activeHeaders.find((h) => normalizeHeaderName(h) === alias);
    if (foundHeader && rowObj[foundHeader] !== undefined && rowObj[foundHeader].trim() !== '') {
      return rowObj[foundHeader];
    }
  }
  for (const alias of aliases) {
    const partialHeader = activeHeaders.find((h) => normalizeHeaderName(h).includes(alias));
    if (partialHeader && rowObj[partialHeader] !== undefined && rowObj[partialHeader].trim() !== '') {
      return rowObj[partialHeader];
    }
  }
  return '';
}

function detectIfVacio(grupo: string, motivo: string, proceso: string, observaciones: string): boolean {
  const normProceso = proceso.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (normProceso.includes('quemado') || normProceso.includes('horno') || normProceso.includes('coccion')) {
    return true;
  }
  if (
    normProceso.includes('prens') ||
    normProceso.includes('esmalt') ||
    normProceso.includes('clasif') ||
    normProceso.includes('secad') ||
    normProceso.includes('rectif') ||
    normProceso.includes('empaq')
  ) {
    return false;
  }
  const combined = `${grupo} ${motivo} ${observaciones}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\bvacios?\b/.test(combined) || combined.includes('vacio de horno') || combined.includes('horno vacio');
}

export function buildParseResultFromMatrix(
  matrix: string[][],
  fileName: string,
  fileSizeBytes: number,
  delimiter: CsvDelimiter,
  batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
): { result?: CsvParseResult; error?: CsvFileValidationError } {
  if (matrix.length === 0) {
    return {
      error: {
        code: 'MALFORMED_CSV',
        message: `No se detectaron columnas en "${fileName}"`,
        detail: 'Asegurate de que la primera fila contenga los encabezados separados por punto y coma o coma.',
      },
    };
  }

  if (matrix.length < 2) {
    return {
      error: {
        code: 'NO_DATA_ROWS',
        message: `"${fileName}" solo contiene la fila de encabezados`,
        detail: 'Agregá al menos una fila con registros de paradas o vacíos para analizar el archivo.',
      },
    };
  }

  const headerKeywords = [
    'CENTRO',
    'PLANTA',
    'SECTOR',
    'MAQUINA',
    'EQUIPO',
    'PROCESO',
    'GRUPO',
    'MOTIVO',
    'DURACION',
    'MINUTOS',
    'FECHA',
    'TURNO',
    'PRODUCTO',
  ];

  let headerRowIndex = 0;
  let bestHeaderScore = -1;
  const maxHeaderScan = Math.min(matrix.length - 1, 15);
  for (let i = 0; i < maxHeaderScan; i += 1) {
    const rowNorms = matrix[i].map((cell) => normalizeHeaderName(String(cell ?? '')));
    const score = rowNorms.filter((n) => headerKeywords.some((kw) => n === kw || n.includes(kw))).length;
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      headerRowIndex = i;
    }
  }
  if (bestHeaderScore < 2) {
    headerRowIndex = 0;
  }

  const dataMatrix = matrix.slice(headerRowIndex);
  const rawHeaders = deduplicateHeaders(dataMatrix[0]);
  const ignoredSet = new Set<string>(IGNORED_SAP_AUDIT_COLUMNS);

  const activeColumnIndices: number[] = [];
  const activeHeaders: string[] = [];
  const ignoredAuditColumns: string[] = [];

  rawHeaders.forEach((header, idx) => {
    const norm = normalizeHeaderName(header);
    if (ignoredSet.has(norm)) {
      ignoredAuditColumns.push(header);
    } else {
      activeColumnIndices.push(idx);
      activeHeaders.push(header);
    }
  });

  const activeNormalizedSet = new Set(activeHeaders.map(normalizeHeaderName));
  const coreNormalizedSet = new Set<string>(CORE_SAP_COLUMNS);

  const matchedCoreColumns = CORE_SAP_COLUMNS.filter((col) => activeNormalizedSet.has(col));
  const missingCoreColumns = CORE_SAP_COLUMNS.filter((col) => !activeNormalizedSet.has(col));
  const extraColumns = activeHeaders.filter(
    (header) => !coreNormalizedSet.has(normalizeHeaderName(header))
  );

  const schemaReport: SchemaMatchReport = {
    detectedHeaders: rawHeaders,
    activeHeaders,
    matchedCoreColumns,
    missingCoreColumns,
    ignoredAuditColumns,
    extraColumns,
  };

  const issues: RowIssue[] = [];
  const rows: Record<string, string>[] = [];
  const events: DowntimeEvent[] = [];

  for (let r = 1; r < dataMatrix.length; r += 1) {
    const rawCells = dataMatrix[r];
    if (!rawCells.some((c) => String(c ?? '').trim().length > 0)) {
      continue;
    }

    const rowNumber = headerRowIndex + r + 1;
    if (rawCells.length !== rawHeaders.length) {
      issues.push({
        rowNumber,
        column: 'ESTRUCTURA',
        severity: 'warning',
        message: `Se esperaban ${rawHeaders.length} columnas y se encontraron ${rawCells.length}.`,
      });
    }

    const rowObj: Record<string, string> = {};
    activeColumnIndices.forEach((colIdx, activeIdx) => {
      const key = activeHeaders[activeIdx];
      rowObj[key] = String(rawCells[colIdx] ?? '').trim();
    });

    const centro = findColumnValue(rowObj, activeHeaders, ['CENTRO', 'PLANTA', 'SECTOR', 'SUCURSAL']) || 'Sin especificar';
    const maquina = findColumnValue(rowObj, activeHeaders, ['MAQUINA', 'EQUIPO', 'PUESTO DE TRABAJO']);
    const turno = findColumnValue(rowObj, activeHeaders, ['TURNO']) || 'Sin turno';
    const fechaSap = findColumnValue(rowObj, activeHeaders, ['FECHA SAP', 'FECHA INICIO', 'FECHA']);
    const proceso = findColumnValue(rowObj, activeHeaders, ['PROCESO', 'AREA', 'LINEA']) || 'Sin proceso';
    const grupo = findColumnValue(rowObj, activeHeaders, ['GRUPO', 'CATEGORIA']) || 'Sin grupo';
    const motivo = findColumnValue(rowObj, activeHeaders, ['MOTIVO', 'CODIGO', 'CAUSA', 'DESCRIPCION']) || 'Sin motivo especificado';
    const fechaFin = findColumnValue(rowObj, activeHeaders, ['FECHA FIN', 'FECHA SAP (2)', 'FIN']);
    const duracionRaw = findColumnValue(rowObj, activeHeaders, [
      'DURACION',
      'DURACION MIN',
      'DURACION (MIN)',
      'MINUTOS',
      'TIEMPO MUERTO',
      'TIEMPO PARADA',
      'TIEMPO DE PARADA',
      'TIEMPO',
      'DUR',
      'MIN',
      'MINS',
    ]);
    const producto = findColumnValue(rowObj, activeHeaders, ['PRODUCTO', 'MATERIAL', 'FORMATO']) || '—';
    const numeroAvisoSap = findColumnValue(rowObj, activeHeaders, ['NUMERO DE AVISO SAP', 'AVISO SAP', 'AVISO', 'NRO AVISO']) || '—';
    const observaciones = findColumnValue(rowObj, activeHeaders, ['OBSERVACIONES', 'COMENTARIOS', 'DETALLE']) || '';

    if (!maquina) {
      issues.push({
        rowNumber,
        column: 'MAQUINA',
        severity: 'error',
        message: 'Falta el identificador de MAQUINA.',
      });
    }

    let duracionMinutos = 0;
    if (!duracionRaw) {
      issues.push({
        rowNumber,
        column: 'DURACION',
        severity: 'error',
        message: 'Falta el valor de DURACION.',
      });
    } else {
      if (!isValidDurationValue(duracionRaw)) {
        issues.push({
          rowNumber,
          column: 'DURACION',
          severity: 'warning',
          message: `Formato de duración no estándar "${duracionRaw}".`,
        });
      }
      duracionMinutos = parseDurationToMinutes(duracionRaw);
    }

    // Fallback to FECHA FIN - FECHA SAP if duration column is missing or zeroed out with valid timestamps
    if (duracionMinutos === 0 && fechaSap && fechaFin) {
      const startTs = parseFullTimestamp(fechaSap);
      const endTs = parseFullTimestamp(fechaFin);
      if (startTs && endTs && endTs.getTime() > startTs.getTime()) {
        const diffMin = (endTs.getTime() - startTs.getTime()) / 60000;
        if (diffMin > 0 && diffMin <= 14 * 24 * 60) {
          duracionMinutos = Math.round(diffMin * 10) / 10;
        }
      }
    }

    const fechaIso = parseSapDateToIso(fechaSap);
    const monthKey = fechaIso ? fechaIso.slice(0, 7) : null;
    const isVacio = detectIfVacio(grupo, motivo, proceso, observaciones);

    events.push({
      id: `${batchId}-${rowNumber}`,
      batchId,
      rowNumber,
      centro,
      maquina: maquina || 'Sin máquina',
      turno,
      fechaSap,
      fechaIso,
      monthKey,
      proceso,
      grupo,
      motivo,
      fechaFin,
      duracionMinutos,
      duracionRaw,
      producto,
      numeroAvisoSap,
      observaciones,
      isVacio,
      raw: rowObj,
    });

    rows.push(rowObj);
  }

  const errorRowSet = new Set(
    issues.filter((issue) => issue.severity === 'error').map((issue) => issue.rowNumber)
  );

  return {
    result: {
      batchId,
      fileName,
      fileSizeBytes,
      delimiter,
      totalRows: rows.length,
      validRowsCount: rows.length - errorRowSet.size,
      headers: activeHeaders,
      rows,
      events,
      schemaReport,
      issues,
      parsedAt: new Date().toISOString(),
      isValid: errorRowSet.size === 0,
    },
  };
}

export function rehydrateBatches(batches: CsvParseResult[]): CsvParseResult[] {
  return batches.map((batch) => {
    const headers = Array.isArray(batch.headers) ? batch.headers : [];
    const updatedEvents = (batch.events || []).map((ev) => {
      const rowObj = ev.raw || {};
      const centro =
        (headers.length > 0
          ? findColumnValue(rowObj, headers, ['CENTRO', 'PLANTA', 'SECTOR', 'SUCURSAL'])
          : '') || ev.centro;
      const duracionRaw =
        (headers.length > 0
          ? findColumnValue(rowObj, headers, [
              'DURACION',
              'DURACION MIN',
              'DURACION (MIN)',
              'MINUTOS',
              'TIEMPO MUERTO',
              'TIEMPO PARADA',
              'TIEMPO DE PARADA',
              'TIEMPO',
              'DUR',
              'MIN',
              'MINS',
            ])
          : '') || ev.duracionRaw || '';

      let duracionMinutos = duracionRaw ? parseDurationToMinutes(duracionRaw) : ev.duracionMinutos || 0;
      if (duracionMinutos === 0 && ev.fechaSap && ev.fechaFin) {
        const startTs = parseFullTimestamp(ev.fechaSap);
        const endTs = parseFullTimestamp(ev.fechaFin);
        if (startTs && endTs && endTs.getTime() > startTs.getTime()) {
          const diffMin = (endTs.getTime() - startTs.getTime()) / 60000;
          if (diffMin > 0 && diffMin <= 14 * 24 * 60) {
            duracionMinutos = Math.round(diffMin * 10) / 10;
          }
        }
      }

      const fechaIso = ev.fechaSap ? parseSapDateToIso(ev.fechaSap) ?? ev.fechaIso : ev.fechaIso;
      const monthKey = fechaIso ? fechaIso.slice(0, 7) : ev.monthKey;
      const isVacio = detectIfVacio(ev.grupo, ev.motivo, ev.proceso, ev.observaciones);

      return {
        ...ev,
        centro,
        duracionRaw,
        duracionMinutos,
        fechaIso,
        monthKey,
        isVacio,
      };
    });

    return {
      ...batch,
      events: updatedEvents,
    };
  });
}

export function parseAndValidateCsvText(
  text: string,
  fileName: string,
  fileSizeBytes: number
): { result?: CsvParseResult; error?: CsvFileValidationError } {
  if (!text.trim()) {
    return {
      error: {
        code: 'EMPTY_FILE',
        message: `"${fileName}" no contiene texto legible`,
        detail: 'El archivo no tiene encabezados ni registros de datos.',
      },
    };
  }

  const delimiter = detectDelimiter(text);
  const matrix = parseCsvMatrix(text, delimiter);
  return buildParseResultFromMatrix(matrix, fileName, fileSizeBytes, delimiter);
}

export async function parseUploadedFile(
  file: File
): Promise<{ result?: CsvParseResult; error?: CsvFileValidationError }> {
  const metaError = validateUploadFileMeta(file);
  if (metaError) {
    return { error: metaError };
  }

  const lowerName = file.name.toLowerCase();

  try {
    if (lowerName.endsWith('.csv')) {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      // Fallback to Windows-1252/Latin1 if SAP exported replacement characters
      if (text.includes('\uFFFD')) {
        text = new TextDecoder('windows-1252').decode(buffer);
      }
      return parseAndValidateCsvText(text, file.name, file.size);
    }

    if (lowerName.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const records: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.rows)
          ? parsed.rows
          : Array.isArray(parsed?.data)
            ? parsed.data
            : [];

      if (records.length === 0) {
        return {
          error: {
            code: 'NO_DATA_ROWS',
            message: `No se encontraron registros en "${file.name}"`,
            detail: 'El archivo JSON debe ser un arreglo de objetos con columnas de parada.',
          },
        };
      }

      const headers = Array.from(
        records.reduce((set, item) => {
          Object.keys(item).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );

      const matrix: string[][] = [
        headers,
        ...records.map((item) => headers.map((h) => String(item[h] ?? ''))),
      ];

      return buildParseResultFromMatrix(matrix, file.name, file.size, 'json');
    }

    // Excel (.xlsx / .xls) via SheetJS
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        error: {
          code: 'NO_DATA_ROWS',
          message: `El libro "${file.name}" no tiene hojas`,
          detail: 'Verificá que el archivo Excel contenga al menos una hoja con datos.',
        },
      };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    const formatExcelCell = (cell: unknown): string => {
      if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        // Add 1 second to neutralize SheetJS sub-second rounding drift (e.g. 14:29:59.999)
        const adjusted = new Date(cell.getTime() + 1000);
        const y = adjusted.getFullYear();
        const m = String(adjusted.getMonth() + 1).padStart(2, '0');
        const d = String(adjusted.getDate()).padStart(2, '0');
        const hh = String(adjusted.getHours()).padStart(2, '0');
        const mm = String(adjusted.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}`;
      }
      return String(cell ?? '').trim();
    };

    const stringMatrix = matrix
      .map((row) => row.map(formatExcelCell))
      .filter((row) => row.some((cell) => cell.length > 0));

    return buildParseResultFromMatrix(stringMatrix, file.name, file.size, 'xlsx');
  } catch (err) {
    return {
      error: {
        code: 'MALFORMED_CSV',
        message: `Error al procesar "${file.name}"`,
        detail: err instanceof Error ? err.message : 'No se pudo interpretar la estructura del archivo.',
      },
    };
  }
}

export function logParsedCsvToConsole(result: CsvParseResult): void {
  const delimiterLabel =
    result.delimiter === ';'
      ? 'Punto y coma (;)'
      : result.delimiter === '\t'
        ? 'Tabulador (\\t)'
        : result.delimiter === 'xlsx'
          ? 'Excel (XLSX)'
          : result.delimiter === 'json'
            ? 'JSON'
            : 'Coma (,)';

  console.groupCollapsed(
    `[KilnPulse] ${result.fileName} — ${result.totalRows} eventos (${delimiterLabel})`
  );
  console.log('Metadatos del archivo:', {
    fileName: result.fileName,
    fileSizeBytes: result.fileSizeBytes,
    delimiter: result.delimiter,
    totalRows: result.totalRows,
    validRowsCount: result.validRowsCount,
    parsedAt: result.parsedAt,
  });
  console.log('Validación de esquema SAP:', {
    activeHeaders: result.schemaReport.activeHeaders,
    matchedCoreColumns: result.schemaReport.matchedCoreColumns,
    missingCoreColumns: result.schemaReport.missingCoreColumns,
    ignoredAuditColumns: result.schemaReport.ignoredAuditColumns,
  });
  if (result.issues.length > 0) {
    console.warn(`Observaciones de validación (${result.issues.length}):`, result.issues);
  }
  console.log('Eventos normalizados:', result.events);
  if (result.rows.length > 0) {
    console.table(result.rows.slice(0, 25));
  }
  console.groupEnd();
}

export const SAMPLE_CERAMIC_PLANT_CSV = `CENTRO;MAQUINA;TURNO;FECHA SAP;PROCESO;GRUPO;MOTIVO;FECHA FIN;DURACION;PRODUCTO;NUMERO DE AVISO SAP;OBSERVACIONES;AP PV1;AP AP1;AP AP2;CREATED BY;UPDATED BY
PP1;HORNO-PP1;T1 - Mañana;2026-10-12 06:15;Quemado;PP1;VH-01 Falta de bizcocho en pulmón de entrada;2026-10-12 07:10;55;Porcelanato 60x60 Gris;400017801;Box de carga línea PP1 sin stock por parada previa de esmaltado;X;01;02;JPEREZ;MGOMEZ
PP1;PRENSA-PP1;T1 - Mañana;2026-10-12 09:00;Prensado;PP1;PM-14 Fuga hidráulica en cilindro principal;2026-10-12 10:35;95;Porcelanato 60x60 Gris;400017809;Se reemplazó sello de alta presión y se purgó circuito;X;02;01;RLOPEZ;RLOPEZ
PM1;ESMALTADORA-PM1;T2 - Tarde;2026-10-18 14:20;Esmaltado;PM1;Q324 Cambio de diseño;2026-10-18 15:00;40;Revestimiento 30x60 Blanco;400017845;Cambio programado de diseño según orden de producción;X;01;01;MGOMEZ;MGOMEZ
PP1;HORNO-PP1;T3 - Noche;2026-10-22 23:10;Quemado;PP1;VH-02 Rotura de rodillo en zona de precalentamiento;2026-10-23 00:50;100;Porcelanato 80x80 Grafito;400017912;Se retiraron fragmentos cerámicos y se sustituyó rodillo cerámico Z2;X;03;02;LFERNANDEZ;ACASTRO
PP1;HORNO-PP1;T1 - Mañana;2026-11-02 06:15;Quemado;PP1;Q324 Cambio de diseño;2026-11-02 07:05;50;Porcelanato 60x60 Gris;400018291;Vacío generado en horno PP1 por cambio de formato en línea;X;01;02;JPEREZ;MGOMEZ
PP1;PRENSA-PP1;T1 - Mañana;2026-11-02 08:10;Prensado;PP1;PM-14 Fuga hidráulica en cilindro principal;2026-11-02 09:40;90;Piso Cerámico 45x45 Arena;400018294;Presión de trabajo cayó a 140 bar; cambio de o-ring en válvula proporcional;X;02;01;RLOPEZ;RLOPEZ
PP1;ESMALTADORA-PP1;T2 - Tarde;2026-11-02 14:30;Esmaltado;PP1;PP-04 Limpieza de campana y cambio de esmalte;2026-11-02 15:05;35;Porcelanato 60x60 Gris;400018302;Ajuste de densidad de engobe y limpieza de picos de cabina;X;01;01;MGOMEZ;MGOMEZ
PP1;HORNO-PP1;T2 - Tarde;2026-11-05 18:20;Quemado;PP1;PE-08 Falla en variador de ventilador de enfriamiento;2026-11-05 19:25;65;Porcelanato 60x60 Gris;400018310;Reinicio de módulo VFD en zona Z4 y verificación térmica;X;03;02;ACASTRO;JPEREZ
PM1;PRENSA-PM1;T3 - Noche;2026-11-05 22:05;Prensado;PM1;PM-21 Atasco en transportador de rodillos salida;2026-11-05 22:30;25;Monococción 45x45 Beige;400018319;Ajuste de sensor fotoeléctrico y alineación de correa;X;02;03;LFERNANDEZ;LFERNANDEZ
PM2;HORNO-PM2;T1 - Mañana;2026-11-08 07:45;Quemado;PM2;VH-03 Corte de suministro en robot cargador;2026-11-08 09:15;90;Revestimiento 30x60 Blanco;400018325;Baja presión en línea de aire comprimido del robot cargador;X;01;04;LFERNANDEZ;ACASTRO
PM1;HORNO-PM1;T2 - Tarde;2026-11-08 15:10;Quemado;PM1;VH-01 Falta de bizcocho en pulmón de entrada;2026-11-08 16:45;95;Monococción 45x45 Beige;400018340;Parada aguas arriba en esmaltado bloqueó ingreso al horno;X;02;01;MGOMEZ;MGOMEZ
PM2;ESMALTADORA-PM2;T2 - Tarde;2026-11-08 14:40;Esmaltado;PM2;Q324 Cambio de diseño;2026-11-08 16:00;80;Revestimiento 30x60 Blanco;400018338;Cambio de pantalla serigráfica y ajuste de tono;X;01;02;ACASTRO;ACASTRO
PM2;PRENSA-PM2;T3 - Noche;2026-11-11 02:15;Prensado;PM2;PM-09 Desgaste de matriz y limpieza de moldes;2026-11-11 03:25;70;Revestimiento 30x60 Blanco;400018361;Rebaba excesiva en bordes; limpieza con cepillo y ajuste de punzón;X;01;01;RLOPEZ;RLOPEZ
PP1;HORNO-PP1;T1 - Mañana;2026-11-14 08:30;Quemado;PP1;VH-01 Falta de bizcocho en pulmón de entrada;2026-11-14 09:30;60;Porcelanato 60x60 Gris;400018390;Esperando liberación de lote desde esmaltado;X;01;02;JPEREZ;JPEREZ`;
