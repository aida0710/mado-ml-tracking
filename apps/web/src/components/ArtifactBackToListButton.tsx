import { ChevronLeft } from 'lucide-react';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** 狭い画面ではプレビューがファイルの一覧を覆うので、このボタンで一覧に戻る。 */
export function ArtifactBackToListButton({ onClick }: { onClick: () => void }) {
  useLocale();
  return (
    <button type="button" className="button artifact-back-to-list" onClick={onClick}>
      <ChevronLeft size={16} aria-hidden="true" />
      {text.artifactBackToList}
    </button>
  );
}
