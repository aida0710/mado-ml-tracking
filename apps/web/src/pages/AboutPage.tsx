import { SettingsPageHeader } from '../components/SettingsPageHeader';
import { APP_VERSION, commitUrl, GIT_COMMIT, GIT_COMMIT_DATE, REPOSITORY_URL } from '../lib/buildInfo';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

// コミットは、GitHubなどでも使う先頭7文字で見せる（リンクは完全なハッシュ）。
const SHORT_COMMIT_LENGTH = 7;
// コミットの日時は日付（ISO 8601の先頭のYYYY-MM-DD）だけを見せる。
const ISO_DATE_LENGTH = 10;

/**
 * 全体設定 → このアプリについて。動いているWebの版と、ビルドしたコミット・その日付・リポジトリ
 * （mado S3 Data CatalogのAboutと同じ項目）。
 */
export function AboutPage() {
  useLocale();
  const commitDate = GIT_COMMIT_DATE.slice(0, ISO_DATE_LENGTH);
  return (
    <>
      <SettingsPageHeader section="about" />
      <dl className="details-list about-details">
        <div>
          <dt>{text.aboutVersion}</dt>
          <dd className="mono">{APP_VERSION ? `v${APP_VERSION}` : '—'}</dd>
        </div>
        <div>
          <dt>{text.aboutCommit}</dt>
          <dd className="mono">
            {GIT_COMMIT ? (
              <a href={commitUrl(GIT_COMMIT)} target="_blank" rel="noreferrer">
                {GIT_COMMIT.slice(0, SHORT_COMMIT_LENGTH)}
              </a>
            ) : (
              <span className="muted">{text.aboutDevelopmentBuild}</span>
            )}
            {commitDate && <span className="muted">{` · ${commitDate}`}</span>}
          </dd>
        </div>
        <div>
          <dt>{text.aboutRepository}</dt>
          <dd className="mono">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              {REPOSITORY_URL.replace(/^https?:\/\//, '')}
            </a>
          </dd>
        </div>
      </dl>
    </>
  );
}
