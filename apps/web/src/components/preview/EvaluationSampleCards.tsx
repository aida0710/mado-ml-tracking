import { sampleTextDiff } from '../../lib/evaluationSamples';
import { formatValue } from '../../lib/format';
import { AudioArtifactViewer } from './AudioArtifactViewer';
import { SampleAudioCell, SampleComparedText, type EvaluationSampleListProps } from './EvaluationSampleCells';
import { useLocale } from '../../i18n/useLocale';
import { artifactsTextTemplates } from '../../i18n/artifacts';

/**
 * 1ページ分の評価サンプルを、1件ずつカードにしてスマートフォンに出す。5列は入らず、横に
 * スクロールする表ではscoreとpredictionが隠れてしまう。scoreは見出しの行番号の横に置き、
 * referenceとpredictionは縦に積んで、テキストの各行が幅いっぱいを使えるようにする。
 */
export function EvaluationSampleCards({
  samples,
  audios,
  highlightDiff,
  expandedLine,
  onToggleExpanded,
}: EvaluationSampleListProps) {
  useLocale();
  return (
    <ol className="evaluation-sample-cards">
      {samples.map((sample, index) => {
        const segments = highlightDiff ? sampleTextDiff(sample) : null;
        const audio = audios[index]!;
        const expanded = expandedLine === sample.line;
        return (
          <li key={sample.line} className="evaluation-sample-card">
            <header>
              <span>{artifactsTextTemplates.evaluationLine(sample.line)}</span>
              <span className="mono">score {sample.score === null ? '—' : formatValue(sample.score)}</span>
            </header>
            <SampleAudioCell
              source={sample.audio}
              audio={audio}
              expanded={expanded}
              onToggle={() => onToggleExpanded(sample.line)}
            />
            {expanded && audio.kind === 'found' && <AudioArtifactViewer artifact={audio.artifact} />}
            <dl>
              <dt>reference</dt>
              <dd className="sample-text">
                <SampleComparedText value={sample.reference} segments={segments} hidden="insert" />
              </dd>
              <dt>prediction</dt>
              <dd className="sample-text">
                <SampleComparedText value={sample.prediction} segments={segments} hidden="delete" />
              </dd>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}
