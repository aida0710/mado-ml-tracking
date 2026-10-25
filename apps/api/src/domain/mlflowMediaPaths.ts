/**
 * MLflowのlog_image(key=, step=)のファイル名。公式のSDKは1回の呼び出しで原寸の画像と、圧縮した
 * .webpを1つずつ書く。名前の形はリリースの間で変わった。
 *   3.0.0:  images/<key>%step%<step>%timestamp%<ms>%<uuid>.png  and  ...%compressed.webp
 *           （keyの'/'は'#'になる）
 *   3.17.0: images/<key>+step+<step>+timestamp+<ms>+<uuid>.png  and  ...+compressed.webp
 *           （keyの'/'は'~'になる）
 */

export interface MlflowImagePath {
  key: string;
  step: number;
  /** SDKが名前に入れたミリ秒。 */
  timestamp: number;
  /** MLflow 3.0は'%'、それより後のリリースは'+'。 */
  separator: '%' | '+';
  /** SDKが名前に入れたuuid。 */
  fileId: string;
  /** MLflowがサムネイルとして表示する、圧縮した.webpならtrue。 */
  compressed: boolean;
  /** 同じ呼び出しで書かれた原寸の画像のパス（圧縮版でなければ自分自身）。 */
  imagePath: string;
  /** 同じ呼び出しで書かれた圧縮した画像のパス（圧縮版なら自分自身）。 */
  compressedPath: string;
}

const IMAGE_DIRECTORY = 'images/';
const COMPRESSED_EXTENSION = '.webp';
const IMAGE_EXTENSION = '.png';
// 区切り文字ごとの、keyの'/'の置き換え先。その区切り文字を使ったSDKのリリースが書いたとおり。
const KEY_SLASH_REPLACEMENT: Record<string, string> = { '%': '#', '+': '~' };
// SDKは[a-zA-Z0-9_\-./ ]からなるkeyを受け付ける。ここでは区切り文字そのものだけを除く。
const FILE_NAME_PATTERN =
  /^(?<key>[^/%+]+)(?<separator>[%+])step\k<separator>(?<step>0|[1-9]\d*)\k<separator>timestamp\k<separator>(?<timestamp>0|[1-9]\d*)\k<separator>(?<id>[0-9a-z-]+?)(?<compressed>\k<separator>compressed)?(?<extension>\.png|\.webp)$/;

// MLflow 3.0はuuidをg-zで始め、区切り文字のあとに16進の2桁が続かないようにしている。
const PERCENT_FILE_ID_PATTERN = /^[g-z]/;

/** MLflowのlog_image(key=, step=)のパスの各部分。それ以外のパスはnull。 */
export function parseMlflowImagePath(path: string): MlflowImagePath | null {
  if (!path.startsWith(IMAGE_DIRECTORY)) return null;
  const match = FILE_NAME_PATTERN.exec(path.slice(IMAGE_DIRECTORY.length));
  if (!match?.groups) return null;
  const { separator, id, extension } = match.groups as Record<string, string>;
  const compressed = match.groups.compressed !== undefined;
  // SDKは原寸の画像を.png、圧縮した画像を.webpで書き、ほかの形式は使わない。
  if (extension !== (compressed ? COMPRESSED_EXTENSION : IMAGE_EXTENSION))
    return null;
  const step = Number(match.groups.step);
  const timestamp = Number(match.groups.timestamp);
  if (!Number.isSafeInteger(step) || !Number.isSafeInteger(timestamp)) return null;
  const key = match.groups.key!.split(KEY_SLASH_REPLACEMENT[separator!]!).join('/');
  const stem = `${IMAGE_DIRECTORY}${match.groups.key}${separator}step${separator}${match.groups.step}${separator}timestamp${separator}${match.groups.timestamp}${separator}${id}`;
  return {
    key,
    step,
    timestamp,
    separator: separator as '%' | '+',
    fileId: id!,
    compressed,
    imagePath: `${stem}${IMAGE_EXTENSION}`,
    compressedPath: `${stem}${separator}compressed${COMPRESSED_EXTENSION}`,
  };
}

/**
 * MLflow 3.0のlog_imageのファイル名ならtrue。その'%'の区切りはデコード後のパスでも文字そのもの
 * なので、Artifactのパスの検査は、ちょうどこの名前に限って、数字（stepとtimestamp）の前の'%'を
 * 二重のパーセントエンコードとみなさずに残す。
 */
export function isMlflowPercentImagePath(path: string): boolean {
  const image = parseMlflowImagePath(path);
  return image?.separator === '%' && PERCENT_FILE_ID_PATTERN.test(image.fileId);
}

/**
 * MLflowのlog_tableがmlflow.loggedArtifactsのtagに並べる表のパス
 * （[{"path": "tables/x.json", "type": "table"}, ...]）。形式の壊れたtagや要素はエラーにせず
 * 飛ばす。tagはクライアントが書くもので、ファイル自体はArtifactとして一覧に残る。
 */
export function parseLoggedTablePaths(tagValue: string | undefined): string[] {
  if (!tagValue) return [];
  let entries: unknown;
  try {
    entries = JSON.parse(tagValue);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  const paths = entries.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { path, type } = entry as { path?: unknown; type?: unknown };
    // パスは保存済みのArtifactのパスと比べるだけなので、安全でないパスは何にも合わないだけで済む。
    return type === 'table' && typeof path === 'string' && path !== '' ? [path] : [];
  });
  return [...new Set(paths)];
}
