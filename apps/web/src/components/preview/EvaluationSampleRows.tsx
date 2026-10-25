import { Fragment } from 'react';
import { sampleTextDiff } from '../../lib/evaluationSamples';
import { formatValue } from '../../lib/format';
import { AudioArtifactViewer } from './AudioArtifactViewer';
import { SampleAudioCell, SampleComparedText, type EvaluationSampleListProps } from './EvaluationSampleCells';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

const COLUMN_COUNT = 5;

/** 1ページ分の評価サンプルを表の行で出す。横に並べて読める幅のある画面向け。 */
export function EvaluationSampleRows({
  samples,
  audios,
  highlightDiff,
  expandedLine,
  onToggleExpanded,
}: EvaluationSampleListProps) {
  useLocale();
  return (
    <div className="table-scroll">
      <table className="evaluation-samples-table">
        <thead>
          <tr>
            <th scope="col">{text.evaluationLineColumn}</th>
            <th scope="col">audio</th>
            <th scope="col">reference</th>
            <th scope="col">prediction</th>
            <th scope="col">score</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample, index) => {
            const segments = highlightDiff ? sampleTextDiff(sample) : null;
            const audio = audios[index]!;
            const expanded = expandedLine === sample.line;
            return (
              <Fragment key={sample.line}>
                <tr>
                  <td className="mono">{sample.line}</td>
                  <td className="sample-audio-cell">
                    <SampleAudioCell
                      source={sample.audio}
                      audio={audio}
                      expanded={expanded}
                      onToggle={() => onToggleExpanded(sample.line)}
                    />
                  </td>
                  <td className="sample-text">
                    <SampleComparedText value={sample.reference} segments={segments} hidden="insert" />
                  </td>
                  <td className="sample-text">
                    <SampleComparedText value={sample.prediction} segments={segments} hidden="delete" />
                  </td>
                  <td className="mono">{sample.score === null ? '—' : formatValue(sample.score)}</td>
                </tr>
                {expanded && audio.kind === 'found' && (
                  <tr className="evaluation-sample-detail">
                    <td colSpan={COLUMN_COUNT}>
                      <AudioArtifactViewer artifact={audio.artifact} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
