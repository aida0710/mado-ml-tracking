import type { ArtifactBackend } from './index.js';

/** Projectの中の、1つの保存先にあるArtifact。大きさはアップロード時に記録したバイト数。 */
export interface ArtifactBackendUsage {
  backend: ArtifactBackend;
  /** 削除されていないArtifact。すべてのバージョンを含む。 */
  artifactCount: number;
  totalBytes: number;
  /** 削除済みで、ガベージコレクタがまだ実体（blob）を消していないArtifact。 */
  pendingDeletionCount: number;
  pendingDeletionBytes: number;
  /**
   * 同じパスへの新しいアップロード（またはMLflowでの削除）に置き換えられた以前のアップロードの
   * うち、モデルバージョン・CodeVersion・DatasetVersion・保持中のcheckpointのどれからも
   * 参照されていないもの。自動では消さない。Project adminが削除できる。
   */
  unreferencedOldVersionCount: number;
  unreferencedOldVersionBytes: number;
}

/** GET /projects/:p/artifact-usage. */
export interface ArtifactUsage {
  /** ProjectのArtifactを1つでも持つ保存先。名前の順。 */
  backends: ArtifactBackendUsage[];
  /** 削除したArtifactの実体（blob）を、ガベージコレクタが消すまで残しておく日数。 */
  deleteGraceDays: number;
}
