import { useMemo, useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../../api/tracking';
import { useCodeLanguage } from '../../hooks/useCodeLanguage';
import { useQuery } from '../../hooks/useQuery';
import { isEvaluationSampleTable, toEvaluationSamples } from '../../lib/evaluationSamples';
import { formatBytes } from '../../lib/format';
import { parseTabularText, type TabularTextFormat } from '../../lib/tabularText';
import { leadingTextWithinBytes } from '../../lib/textPrefix';
import { Resource } from '../Feedback';
import { FormattedCode } from './CodeView';
import { EvaluationSamplesTable } from './EvaluationSamplesTable';
import { PreviewFormatSelect, TABLE_PREVIEW_FORMAT } from './PreviewFormatSelect';
import { TabularTextTable } from './TabularTextTable';
import { TEXT_PREVIEW_MAX_BYTES, TextHeadNotice, TextPreview } from './TextPreview';
import { useLocale } from '../../i18n/useLocale';
import { textTemplates } from '../../i18n/catalog';

/**
 * 何千行もある評価結果は、jsonlで数MBになる。16MiBならメインスレッドでのパースが約1秒に
 * 収まる。それより大きいファイルは、代わりに先頭をテキストで出す。
 */
export const TABULAR_TEXT_MAX_BYTES = 16 * 1024 * 1024;

type TabularView = 'table' | 'text';

function LoadedTabularText({
  artifact,
  content,
  format,
}: {
  artifact: Artifact;
  content: string;
  format: TabularTextFormat;
}) {
  useLocale();
  const parsed = useMemo(() => parseTabularText(content, format), [content, format]);
  const evaluation = useMemo(
    () => (isEvaluationSampleTable(parsed.columns) ? toEvaluationSamples(parsed) : null),
    [parsed],
  );
  // テキストの表示も、ほかのプレビューと同じく色を付けるのは先頭のTEXT_PREVIEW_MAX_BYTESまで。
  const leadingText = useMemo(() => leadingTextWithinBytes(content, TEXT_PREVIEW_MAX_BYTES), [content]);
  const code = useCodeLanguage({ fileName: artifact.path, mimeType: artifact.mimeType, text: leadingText });
  // 読める行が1つも無いファイルはテキストで開き、壊れた行を読めるようにする。
  const hasRows = evaluation ? evaluation.samples.length > 0 : parsed.records.length > 0;
  const [view, setView] = useState<TabularView>(hasRows ? 'table' : 'text');

  if (view === 'text')
    return (
      <>
        <TextHeadNotice artifact={artifact} />
        <FormattedCode content={leadingText} code={code} onShowTable={() => setView('table')} />
      </>
    );
  const formatSelect = (
    <PreviewFormatSelect
      value={TABLE_PREVIEW_FORMAT}
      detected={code.detected}
      offersTable
      onChange={(next) => {
        if (next === TABLE_PREVIEW_FORMAT) return;
        code.setChoice(next);
        setView('text');
      }}
    />
  );
  if (evaluation) return <EvaluationSamplesTable artifact={artifact} table={evaluation} formatSelect={formatSelect} />;
  return <TabularTextTable table={parsed} label={artifact.path} formatSelect={formatSelect} />;
}

/**
 * CSV / TSV / jsonlのファイルを表で出す。音声、reference、predictionの列があれば評価サンプルの
 * 表、無ければ一般の並べ替えできる表。［表示形式］でテキストとの間を切り替える。
 */
export function TabularTextPreview({ artifact, format }: { artifact: Artifact; format: TabularTextFormat }) {
  useLocale();
  const canParse = artifact.size <= TABULAR_TEXT_MAX_BYTES;
  const content = useQuery({ key: canParse ? `${artifact.id}:text` : null, load: (signal) =>
    trackingApi.artifactText(artifact.projectId, artifact.id, signal),
  });
  if (!canParse)
    return <TextPreview artifact={artifact} reason={textTemplates.previewTableTooLarge(formatBytes(TABULAR_TEXT_MAX_BYTES))} />;
  return (
    <Resource query={content}>
      {(value) => <LoadedTabularText key={artifact.id} artifact={artifact} content={value} format={format} />}
    </Resource>
  );
}
