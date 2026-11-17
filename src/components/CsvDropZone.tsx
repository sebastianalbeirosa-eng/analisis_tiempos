import React, { useCallback, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Terminal,
  Upload,
} from 'lucide-react';
import { CsvFileValidationError, CsvParseResult } from '../types/csv';
import {
  logParsedCsvToConsole,
  parseAndValidateCsvText,
  parseUploadedFile,
  SAMPLE_CERAMIC_PLANT_CSV,
} from '../utils/csvParser';

interface CsvDropZoneProps {
  onParsed: (result: CsvParseResult, mode: 'replace' | 'append') => void;
  onClearAll?: () => void;
  activeBatchesCount: number;
  lastParsedResult: CsvParseResult | null;
}

export const CsvDropZone: React.FC<CsvDropZoneProps> = ({
  onParsed,
  onClearAll,
  activeBatchesCount,
  lastParsedResult,
}) => {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [uploadMode, setUploadMode] = useState<'replace' | 'append'>(
    activeBatchesCount > 0 ? 'append' : 'replace'
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileError, setFileError] = useState<CsvFileValidationError | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[], modeOverride?: 'replace' | 'append') => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setIsProcessing(true);
      setFileError(null);

      const effectiveMode = modeOverride ?? uploadMode;

      for (let i = 0; i < fileArray.length; i += 1) {
        const file = fileArray[i];
        const { result, error } = await parseUploadedFile(file);

        if (error) {
          console.error(`[KilnPulse Error] ${error.code}: ${error.message}`, {
            fileName: file.name,
            detail: error.detail,
          });
          setFileError(error);
          setIsProcessing(false);
          return;
        }

        if (result) {
          logParsedCsvToConsole(result);
          // First file respects selected mode, subsequent dropped files append
          onParsed(result, i === 0 ? effectiveMode : 'append');
        }
      }

      setIsProcessing(false);
    },
    [onParsed, uploadMode]
  );

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) {
      setIsDragActive(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) {
      return;
    }

    void handleFiles(droppedFiles);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      void handleFiles(selected);
    }
    e.target.value = '';
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBrowseClick();
    }
  };

  const handleLoadSample = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    setFileError(null);
    const bytes = new Blob([SAMPLE_CERAMIC_PLANT_CSV]).size;
    const { result, error } = parseAndValidateCsvText(
      SAMPLE_CERAMIC_PLANT_CSV,
      'sap_paradas_horno_oct_nov_2026.csv',
      bytes
    );

    if (error) {
      setFileError(error);
    } else if (result) {
      logParsedCsvToConsole(result);
      onParsed(result, 'replace');
    }
    setIsProcessing(false);
  };

  const handleRelogConsole = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lastParsedResult) {
      logParsedCsvToConsole(lastParsedResult);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <section aria-labelledby="csv-upload-heading" className="w-full space-y-3">
      {activeBatchesCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-600">
            Modo de carga para nuevos archivos:
          </span>
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setUploadMode('append')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                uploadMode === 'append'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agregar al historial ({activeBatchesCount})
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('replace')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                uploadMode === 'replace'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reemplazar análisis actual
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json"
        onChange={handleInputChange}
        className="sr-only"
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Arrastrá y soltá tu archivo CSV o Excel de paradas aquí, o presioná Enter para buscar en tu PC"
        onClick={handleBrowseClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 cursor-pointer ${
          isDragActive
            ? 'border-blue-700 bg-blue-50/70'
            : fileError
              ? 'border-red-300 bg-red-50/40 hover:border-red-400'
              : lastParsedResult
                ? 'border-emerald-300 bg-white hover:border-slate-400'
                : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/60'
        }`}
      >
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg border ${
            isDragActive
              ? 'border-blue-200 bg-blue-100 text-blue-700'
              : fileError
                ? 'border-red-200 bg-red-100 text-red-700'
                : lastParsedResult
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          {fileError ? (
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          ) : lastParsedResult ? (
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Upload className="h-5 w-5" aria-hidden="true" />
          )}
        </div>

        <h2 id="csv-upload-heading" className="text-base font-semibold text-slate-900">
          {isProcessing
            ? 'Procesando y validando archivo de tiempos muertos...'
            : isDragActive
              ? 'Soltá el archivo para iniciar el análisis'
              : lastParsedResult
                ? `Último archivo cargado: ${lastParsedResult.fileName}`
                : 'Arrastrá y soltá tu archivo SAP de paradas y vacíos aquí'}
        </h2>

        <p className="mt-1.5 max-w-xl text-sm text-slate-600">
          {lastParsedResult ? (
            <span className="font-mono text-xs tabular-nums text-slate-600">
              {formatBytes(lastParsedResult.fileSizeBytes)} · {lastParsedResult.totalRows} eventos analizados ·{' '}
              {lastParsedResult.schemaReport.matchedCoreColumns.length}/12 columnas SAP detectadas
            </span>
          ) : (
            'Compatible con archivos .csv (delimitados por ; o ,), .xlsx, .xls y .json hasta 25 MB. Se excluyen automáticamente AP PV1, AP AP1, AP AP2, CREATED BY y UPDATED BY.'
          )}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleBrowseClick();
            }}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
          >
            {activeBatchesCount > 0 && uploadMode === 'append' ? (
              <Plus className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {activeBatchesCount > 0 && uploadMode === 'append'
                ? 'Agregar otro CSV / Excel'
                : 'Seleccionar archivo de mi PC'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>Cargar ejemplo Planta Cerámica</span>
          </button>

          {lastParsedResult && (
            <button
              type="button"
              onClick={handleRelogConsole}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
            >
              <Terminal className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>Ver en consola</span>
            </button>
          )}

          {activeBatchesCount > 0 && onClearAll && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFileError(null);
                onClearAll();
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Limpiar datos</span>
            </button>
          )}
        </div>

        {fileError && (
          <div
            role="alert"
            onClick={(e) => e.stopPropagation()}
            className="mt-5 flex w-full max-w-xl items-start gap-3 rounded-md border border-red-200 bg-white px-4 py-3 text-left"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-700">{fileError.message}</p>
              <p className="mt-0.5 text-xs text-slate-600">{fileError.detail}</p>
            </div>
          </div>
        )}

        {lastParsedResult && !fileError && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-5 flex w-full max-w-xl items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-left"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span className="text-xs font-medium text-emerald-900">
                Archivo validado, normalizado y registrado en consola
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-emerald-800 whitespace-nowrap shrink-0">
              {lastParsedResult.schemaReport.ignoredAuditColumns.length} cols omitidas
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
