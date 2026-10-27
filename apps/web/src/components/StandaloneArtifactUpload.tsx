import { useState } from 'react';
import { Upload } from 'lucide-react';
import { ArtifactUploadDialog } from '../dialogs/ArtifactUploadDialog';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Runの無いArtifactをアップロードする。終わったファイルにはコピー用のartifact:// URIを出す。
 * `onUploaded`はファイルが1つ終わるたびに呼ぶ。
 */
export function StandaloneArtifactUpload({
  projectId,
  onUploaded,
}: {
  projectId: string;
  onUploaded: () => void;
}) {
  useLocale();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className="button" onClick={() => setIsOpen(true)}>
        <Upload size={15} />
        {text.uploadArtifact}
      </button>
      {isOpen && (
        <ArtifactUploadDialog
          projectId={projectId}
          runId={null}
          multiple
          onClose={() => setIsOpen(false)}
          onSaved={onUploaded}
        />
      )}
    </>
  );
}
