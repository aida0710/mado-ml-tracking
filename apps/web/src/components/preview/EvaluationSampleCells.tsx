import { Fragment } from 'react';
import { AudioLines } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import type { SampleAudio } from '../../lib/evaluationSampleAudio';
import type { EvaluationSample } from '../../lib/evaluationSamples';
import type { TextDiffSegment } from '../../lib/textDiff';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { artifactReferenceErrorLabels } from '../../i18n/artifacts';

// 1件の評価サンプルの部品。表の行とスマートフォンのカードで共有する。

/** 表の行とスマートフォンのカードの両方が描く、1ページ分のサンプル。 */
export interface EvaluationSampleListProps {
  samples: EvaluationSample[];
  /** 各サンプルの音声。同じ順に並べる（useEvaluationSampleAudio）。 */
  audios: SampleAudio[];
  highlightDiff: boolean;
  /** 波形を開いている行番号。無ければnull。 */
  expandedLine: number | null;
  onToggleExpanded: (line: number) => void;
}

const sampleAudioMessages = {
  get lookup_error() { return text.evaluationAudioLookupError; },
  get run_unavailable() { return text.evaluationAudioRunUnavailable; },
  get not_found() { return text.evaluationAudioNotFound; },
} as const;

/** サンプルの音声のプレイヤーと、その波形を開くボタン。無いときはその理由。 */
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
  useLocale();
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
      {/* preload="none"にする。50行のページで、誰も再生を押す前に50個のファイルを取りに行かないため。 */}
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
 * referenceまたはprediction。`segments`があると（両方が文字列で、差分を強調がオンのとき）、
 * 相手側に無い文字に印を付ける。`hidden`は、相手側自身の変更を除く。
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
  useLocale();
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
