import { formatEnglishCount } from '../formatEnglishCount';
import type { RunMediaKind } from '@mmt/contracts';
import type { MediaTableCellFailure } from "../../lib/mediaTableCells";
import { artifactReferenceErrorLabels, artifactsText } from './artifacts';

export const mediaText = {
  mediaKeys: "Media keys",
  mediaKey: "Key",
  mediaKind: "Type",
  mediaCount: "Count",
  mediaStepRange: "Step range",
  mediaNoKeys: "No step-based media is recorded for this run. Record it with log_image, log_audio, log_table, or similar methods.",
  mediaStepSlider: "Step to display",
  mediaPreviousStep: "Previous step",
  mediaNextStep: "Next step",
  mediaStepHint: "Use arrow keys to move between recorded steps, and Home/End to jump to the first/last step.",
  mediaCaption: "Description",
  mediaTruncated: "Only the first 10,000 records are shown.",
  mediaCompareKey: "Key to compare",
  mediaCompareSteps: "Steps to compare",
  mediaCompareLatestCommon: "Latest common step",
  mediaCompareLatest: "Latest step of each run",
  mediaCompareNoStepsHint: "If no step is selected, the latest step of each run is shown in one column.",
  mediaCompareNoCommonStep:
    "No step is shared by all runs, so by default the latest step of each run is shown in one column.",
  mediaCompareGrid: "Run × step media",
  mediaCompareMissing: "None",
  mediaCompareNoKeys:
    "No step-based media is recorded for the selected runs. Only media logged with a step, such as with log_audio or log_image, can be compared here. Artifact files saved to runs can be viewed side by side in the “Artifacts” tab.",
  mediaCompareHint:
    "Use arrow keys to move between cells. Only one audio clip plays at a time; switching cells resumes at the same playback position.",
  mediaCompareNoSelection: "Select a cell to display it here.",
  mediaRun: 'Run',
  mediaTablePagination: "Table pages",
  mediaCellPlay: "Play",
  mediaCellPause: "Pause",
  mediaCellWaveform: "Waveform",
  mediaCellOpen: "Open",
  mediaCellClose: "Close",
} as const;

export const mediaKindLabels: Record<RunMediaKind, string> = {
  audio: "Audio",
  image: "Image",
  video: "Video",
  table: "Table",
};

// The reference rules are the evaluation sample tables' (lib/evaluationSamples.ts), so their wording is reused.
export const mediaCellErrorLabels: Record<MediaTableCellFailure, string> = {
  empty: artifactReferenceErrorLabels.empty,
  absolute_path: artifactReferenceErrorLabels.absolute_path,
  parent_path: artifactReferenceErrorLabels.parent_path,
  unsupported_scheme: artifactReferenceErrorLabels.unsupported_scheme,
  invalid_run_reference: artifactReferenceErrorLabels.invalid_run_reference,
  other_project: artifactReferenceErrorLabels.other_project,
  not_found: artifactsText.evaluationAudioNotFound,
  unresolved: "Could not resolve artifact",
};

// Text that embeds values; merged into catalog's textTemplates.
export const mediaTextTemplates = {
  mediaStepPosition: (step: number, index: number, count: number) => `step ${step} (${index} / ${count})`,
  mediaStepLabel: (step: number) => `step ${step}`,
  /** Beside a step that not every compared Run recorded. */
  mediaStepRunCoverage: (runCount: number, totalRuns: number) => `${runCount}/${formatEnglishCount(totalRuns, 'run')}`,
  mediaStepRangeValue: (minStep: number, maxStep: number) => (minStep === maxStep ? `${minStep}` : `${minStep}–${maxStep}`),
  mediaItemCount: (count: number) => formatEnglishCount(count, 'item'),
  mediaCompareRecordedSteps: (count: number, minStep: number, maxStep: number) =>
    `Recorded steps: ${count} (${minStep}–${maxStep})`,
  mediaCompareEvenly: (count: number) => count === 1 ? '1 column' : formatEnglishCount(count, 'equal column'),
  mediaCompareTooManyRuns: (maximum: number) => `Media comparison shows only the first ${maximum} runs.`,
  mediaCompareTooManySteps: (maximum: number) => `At most ${maximum} steps can be compared.`,
  mediaCompareFirstOfMany: (count: number) => `This step has ${count} entries. Showing the first one.`,
  mediaCompareCell: (runLabel: string, stepLabel: string, state: string) => `${runLabel}, ${stepLabel}, ${state}`,
  mediaTableRowCount: (count: number) => formatEnglishCount(count, 'row'),
  mediaTableErrorCells: (count: number) => `${formatEnglishCount(count, 'cell')} could not be displayed`,
  mediaTablePage: (page: number, pageCount: number) => `Page ${page} / ${pageCount}`,
};
