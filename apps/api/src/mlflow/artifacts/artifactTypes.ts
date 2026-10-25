import type { Readable } from 'node:stream';
import type { Principal } from '../../auth/principal.js';

export interface ArtifactOwner {
  kind: 'run' | 'model' | 'model-version';
  id: string;
}

export interface ArtifactLocation {
  owner: ArtifactOwner;
  path: string;
}

export interface ArtifactAccess {
  principal: Principal;
  projectId: string;
  owner: ArtifactOwner;
}

export interface ArtifactUpload extends ArtifactAccess {
  path: string;
  mimeType: string;
  body: Readable;
}

export interface ArtifactFile {
  path: string;
  is_dir: boolean;
  // Protobuf JSONはint64を10進の文字列で表す。0バイトのファイルも同じ。
  file_size?: string;
}

export interface ArtifactPathEntry {
  path: string;
  artifactId: string;
  size: number;
}
