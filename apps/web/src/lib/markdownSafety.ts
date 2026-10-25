// Markdown（Runの説明、コメント、レポート）に書いたURLのうち、生きたリンクや画像にしてよいものを
// 決める。MarkdownはProjectのどのメンバーからも、MLflowのクライアントからも来るので、無害と
// 分かっているもの以外のURLはただの文字列として出す。

// ページでスクリプトを動かせず、内容を埋め込めないスキーム。ほか（javascript:、data:、vbscript:、
// file:など）は禁止として一覧に挙げるのではなくすべて断るので、新しいスキームも断ったままになる。
const ALLOWED_LINK_SCHEMES = new Set(['http', 'https', 'mailto']);
const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
// ブラウザはスキームの中のASCIIの空白と制御文字を捨てる（"java\tscript:"）ので、それらを除いて
// スキームを読む。
// eslint-disable-next-line no-control-regex -- 制御文字に一致させるのがここの目的
const IGNORED_URL_CHARACTERS = /[\u0000- \u007f]/g;
// 1つのArtifactの中身を流すAPIのpath（api/tracking.tsのartifactContentPath）。
const ARTIFACT_CONTENT_PATH_PATTERN = /^\/api\/projects\/[^/]+\/artifacts\/[^/]+\/content$/;

/** リンク先のhrefを返す。URLをただの文字列のままにすべきときはnull。 */
export function getSafeLinkHref(url: string): string | null {
  const href = url.trim();
  if (!href) return null;
  const scheme = URL_SCHEME_PATTERN.exec(href.replace(IGNORED_URL_CHARACTERS, ''))?.[1];
  // スキームが無ければ、このアプリの中の相対パス、クエリ、フラグメントのどれか。
  if (scheme === undefined) return href;
  return ALLOWED_LINK_SCHEMES.has(scheme.toLowerCase()) ? href : null;
}

/**
 * Markdownのパーサーは、URLをパーセントエンコードする（引用符なら"%22"）。断ったURLは文字列として
 * 出すので、できるときは書いた人が書いたとおりにデコードし直す。
 */
export function formatUrlForDisplay(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/** リンクがこのアプリの外へ出るときtrue。そのときは新しいタブで、referrerを付けずに開く。 */
export function isExternalLink(href: string, origin: string): boolean {
  if (href.toLowerCase().startsWith('mailto:')) return false;
  try {
    return new URL(href, origin).origin !== origin;
  } catch {
    return true;
  }
}

export type MarkdownImageDisplay =
  | { kind: 'image'; src: string }
  | { kind: 'link'; href: string }
  | { kind: 'text' };

/**
 * 画像として描くのは、このoriginが配信するArtifactの中身だけ。ほかの画像を読み込むと、誰がいつ
 * ページを読んだかがその画像のホストに伝わってしまうので、読む人が自分で開けるリンクにする。
 */
export function getMarkdownImageDisplay(src: string, origin: string): MarkdownImageDisplay {
  const href = getSafeLinkHref(src);
  if (href === null) return { kind: 'text' };
  let resolved: URL;
  try {
    resolved = new URL(href, origin);
  } catch {
    return { kind: 'text' };
  }
  if (resolved.origin === origin && ARTIFACT_CONTENT_PATH_PATTERN.test(resolved.pathname))
    return { kind: 'image', src: `${resolved.pathname}${resolved.search}` };
  return { kind: 'link', href };
}
