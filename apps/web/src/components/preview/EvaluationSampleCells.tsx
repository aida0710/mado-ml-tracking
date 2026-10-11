import { Fragment } from 'react';
import { AudioLines } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import type { SampleAudio } from '../../lib/evaluationSampleAudio';
import type { EvaluationSample } from '../../lib/evaluationSamples';
import type { TextDiffSegment } from '../../lib/textDiff';
import { text } from '../../i18n/catalog';
import { artifactReferenceErrorLabels } from '../../i18n/artifacts';

// The pieces of one evaluation sample, shared by the table rows and the phone cards.

/** One page of samples as the table rows and the phone cards both draw it. */
export interface EvaluationSampleListProps {
  samples: EvaluationSample[];
  /** The audio of each sample, in the same order (useEvaluationSampleAudio). */
  audios: SampleAudio[];
  highlightDiff: boolean;
  /** The line whose waveform is open, if any. */
  expandedLine: number | null;
  onToggleExpanded: (line: number) => void;
}

const sampleAudioMessages = {
  lookup_error: text.evaluationAudioLookupError,
  run_unavailable: text.evaluationAudioRunUnavailable,
  not_found: text.evaluationAudioNotFound,
} as const;

/** The player of the sample's audio and the button that opens its waveform, or why there is none. */
export function SampleAudioCell({
  source,
  audio,
  expanded,
  onToggle,
}: {
  source: string | null;
  audio: SampleAudio;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (audio.kind === 'none') return <span className="muted">—</span>;
  if (audio.kind === 'pending') return <span className="muted">{text.loading}</span>;
  if (audio.kind === 'reference_error')
    return (
      <span className="sample-error" title={source ?? undefined}>
        {artifactReferenceErrorLabels[audio.error]}
      </span>
    );
  if (audio.kind !== 'found')
    return (
      <span className="sample-error" title={source ?? undefined}>
        {sampleAudioMessages[audio.kind]}
      </span>
    );
  return (
    <div className="sample-audio">
      {/* preload="none": a page of 50 rows must not download 50 files before anyone presses play. */}
      <audio
        controls
        preload="none"
        src={trackingApi.artifactUrl(audio.artifact.projectId, audio.artifact.id)}
        aria-label={source ?? undefined}
      />
      <button type="button" className="button small" aria-expanded={expanded} onClick={onToggle}>
        <AudioLines size={14} />
        {text.evaluationShowWaveform}
      </button>
    </div>
  );
}

/**
 * reference or prediction. With `segments` (both were strings and 差分を強調 is on), the characters
 * the other side lacks are marked; `hidden` drops the other side's own changes.
 */
export function SampleComparedText({
  value,
  segments,
  hidden,
}: {
  value: string | null;
  segments: TextDiffSegment[] | null;
  hidden: 'insert' | 'delete';
}) {
  if (!segments) return <>{value ?? '—'}</>;
  return (
    <>
      {segments
        .filter((segment) => segment.kind !== hidden)
        .map((segment, index) =>
          segment.kind === 'equal' ? (
            <Fragment key={index}>{segment.text}</Fragment>
          ) : (
            <mark key={index} className={`text-diff-${segment.kind}`}>
              {segment.text}
            </mark>
          ),
        )}
    </>
  );
}
