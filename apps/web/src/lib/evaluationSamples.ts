// 評価サンプルの表（audio・reference・prediction・scoreの列を持つjsonl / csv / tsv）の、行の
// 読み込み、audioのpathの解決、並べ替え、ページ分け。壊れた行は数えるだけで、直さない。

import { parseTabularText, type TabularRowErrorReason, type TabularText, type TabularTextFormat } from './tabularText';
import { diffCharacters, type TextDiffSegment } from './textDiff';
import { isUuid } from './uuid';

export const EVALUATION_SAMPLES_PAGE_SIZE = 50;
export const EVALUATION_SAMPLE_COLUMNS = ['audio', 'reference', 'prediction', 'score'] as const;
type EvaluationSampleColumn = (typeof EVALUATION_SAMPLE_COLUMNS)[number];
/** ほかのRunのArtifactを指す参照（mmt-artifact://runs/<runId>/<path>）。 */
export const ARTIFACT_REFERENCE_SCHEME = 'mmt-artifact://';

export type EvaluationSampleErrorReason = TabularRowErrorReason | 'invalid_audio' | 'invalid_text' | 'invalid_score';

export interface EvaluationSample {
  /** ファイルの中でその行が始まる行番号（1始まり）。 */
  line: number;
  audio: string | null;
  /** 数値と真偽値（時間の長さ、個数、はい・いいえの判定など）は、その文字列として出す。 */
  reference: string | null;
  prediction: string | null;
  /** ファイルの中で両方とも文字列だった。このときだけ、文字単位の差分に意味がある。 */
  isTextPair: boolean;
  score: number | null;
}
export interface EvaluationSampleError {
  line: number;
  reason: EvaluationSampleErrorReason;
}
export interface EvaluationSampleTable {
  columns: string[];
  samples: EvaluationSample[];
  errors: EvaluationSampleError[];
}

/** audioの列か、referenceとpredictionの両方の列がある表を、評価サンプルとして出す。 */
export function isEvaluationSampleTable(columns: readonly string[]): boolean {
  return columns.includes('audio') || (columns.includes('reference') && columns.includes('prediction'));
}

type SampleResult = { sample: EvaluationSample } | { reason: EvaluationSampleErrorReason };

function readAudio(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' ? value : undefined;
}

/** オブジェクトと配列には比べる1つの文字列が無いので、その行は読めないものとする。 */
function readComparedText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function readScore(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const score = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
}

function toSample(line: number, valueOf: (column: EvaluationSampleColumn) => unknown): SampleResult {
  const audio = readAudio(valueOf('audio'));
  if (audio === undefined) return { reason: 'invalid_audio' };
  const rawReference = valueOf('reference');
  const rawPrediction = valueOf('prediction');
  const reference = readComparedText(rawReference);
  const prediction = readComparedText(rawPrediction);
  if (reference === undefined || prediction === undefined) return { reason: 'invalid_text' };
  const score = readScore(valueOf('score'));
  if (score === undefined) return { reason: 'invalid_score' };
  const isTextPair = typeof rawReference === 'string' && typeof rawPrediction === 'string';
  return { sample: { line, audio, reference, prediction, isTextPair, score } };
}

/** ファイルから読み終えた表の行を、評価サンプルにする。 */
export function toEvaluationSamples(table: TabularText): EvaluationSampleTable {
  const samples: EvaluationSample[] = [];
  const errors: EvaluationSampleError[] = [...table.errors];
  // CSVの見出しには同じ名前が2回出ることがある。その名前の最初の列を読む。
  const columnIndexes = new Map(EVALUATION_SAMPLE_COLUMNS.map((column) => [column, table.columns.indexOf(column)]));
  for (const record of table.records) {
    const valueOf = (column: EvaluationSampleColumn) => {
      const index = columnIndexes.get(column)!;
      return index < 0 ? undefined : record.cells[index];
    };
    const result = toSample(record.line, valueOf);
    if ('sample' in result) samples.push(result.sample);
    else errors.push({ line: record.line, reason: result.reason });
  }
  errors.sort((left, right) => left.line - right.line);
  return { columns: table.columns, samples, errors };
}

export function parseEvaluationSamples(content: string, format: TabularTextFormat): EvaluationSampleTable {
  return toEvaluationSamples(parseTabularText(content, format));
}

/** referenceに対するpredictionの文字単位の差分。ファイルの中で両方とも文字列だったとき以外はnull。 */
export function sampleTextDiff(sample: EvaluationSample): TextDiffSegment[] | null {
  if (!sample.isTextPair || sample.reference === null || sample.prediction === null) return null;
  return diffCharacters(sample.reference, sample.prediction);
}

export type EvaluationSampleOrder = 'line' | 'score_asc' | 'score_desc';

/** scoreの無い行は、昇順でも降順でもscoreのある行の後ろに置く。同じ値の行はファイルの順を保つ。 */
export function sortEvaluationSamples(
  samples: readonly EvaluationSample[],
  order: EvaluationSampleOrder,
): EvaluationSample[] {
  const direction = order === 'score_desc' ? -1 : 1;
  return [...samples].sort((left, right) => {
    if (order !== 'line') {
      if (left.score === null || right.score === null) {
        if (left.score !== right.score) return left.score === null ? 1 : -1;
      } else if (left.score !== right.score) return (left.score - right.score) * direction;
    }
    return left.line - right.line;
  });
}

export interface Page<T> {
  items: T[];
  /** 存在するページの範囲に収めた後のページ番号（0始まり）。 */
  page: number;
  pageCount: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize = EVALUATION_SAMPLES_PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(pageCount - 1, Math.max(0, Math.floor(page)));
  return { items: items.slice(current * pageSize, (current + 1) * pageSize), page: current, pageCount };
}

export interface ArtifactReference {
  runId: string;
  path: string;
}
export type ArtifactReferenceError =
  | 'empty'
  | 'absolute_path'
  | 'parent_path'
  | 'unsupported_scheme'
  | 'invalid_run_reference'
  | 'other_project'
  | 'no_table_run';
export type ArtifactReferenceResult =
  | { ok: true; reference: ArtifactReference }
  | { ok: false; error: ArtifactReferenceError };

const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** "."と空の区切りを捨てる。pathはArtifactのpathと同じく書いたとおりに扱う（パーセントデコードしない）。 */
function normalizeArtifactPath(path: string): { path: string } | { error: ArtifactReferenceError } {
  if (path.startsWith('/')) return { error: 'absolute_path' };
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) return { error: 'parent_path' };
  if (segments.length === 0) return { error: 'empty' };
  return { path: segments.join('/') };
}

/**
 * audioのセルをRunのArtifactに解決する。相対pathは、表を持つRunのArtifactを、そのRunの
 * Artifactのルートから指す。mmt-artifact://runs/<runId>/<path>はほかのRunを指し、このとき
 * APIは今のProjectのRunしか見つけない。長い形の
 * mmt-artifact://projects/<projectId>/runs/<runId>/<path>は、今のProjectのときだけ受け付ける。
 */
export function resolveArtifactReference(
  value: string,
  context: { projectId: string; tableRunId: string | null },
): ArtifactReferenceResult {
  const trimmed = value.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  if (trimmed.startsWith(ARTIFACT_REFERENCE_SCHEME)) {
    let segments = trimmed.slice(ARTIFACT_REFERENCE_SCHEME.length).split('/');
    if (segments[0] === 'projects') {
      if (!isUuid(segments[1] ?? '')) return { ok: false, error: 'invalid_run_reference' };
      if (segments[1]!.toLowerCase() !== context.projectId.toLowerCase())
        return { ok: false, error: 'other_project' };
      segments = segments.slice(2);
    }
    const [kind, runId, ...rest] = segments;
    if (kind !== 'runs' || !isUuid(runId ?? '')) return { ok: false, error: 'invalid_run_reference' };
    const normalized = normalizeArtifactPath(rest.join('/'));
    return 'error' in normalized
      ? { ok: false, error: normalized.error }
      : { ok: true, reference: { runId: runId!.toLowerCase(), path: normalized.path } };
  }
  if (URI_SCHEME_PATTERN.test(trimmed)) return { ok: false, error: 'unsupported_scheme' };
  const normalized = normalizeArtifactPath(trimmed);
  if ('error' in normalized) return { ok: false, error: normalized.error };
  if (!context.tableRunId) return { ok: false, error: 'no_table_run' };
  return { ok: true, reference: { runId: context.tableRunId, path: normalized.path } };
}
