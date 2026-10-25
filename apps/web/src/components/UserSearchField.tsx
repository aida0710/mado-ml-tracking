import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { UserSearchResult } from '@mmt/contracts';
import { useUserSearch } from '../hooks/useUserSearch';
import { isEnterOutsideComposition } from '../lib/imeComposition';
import { ErrorNotice } from './Feedback';
import { UserSummary } from './UserSummary';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

const NO_UNAVAILABLE_USERS: ReadonlyMap<string, string> = new Map();

/**
 * 名前・メールアドレス・ユーザー名の先頭でユーザーを検索し、クリックした人を知らせる。
 * `excludedUserIds`のユーザー（選択済み、またはログイン中の本人）は候補に出さない。
 * `unavailableUsers`のユーザー（既存のメンバーなど）は一覧に出すが選べず、横に理由を出す。
 * 探している人がなぜ出ないのかと迷わせないためである。選ぶと欄は空になってフォーカスを
 * 取り戻し、次のユーザーを検索できる。Enterで周りのフォームを送信することはなく、選べる
 * ユーザーがちょうど1人見つかったときにその人を選ぶ。
 * `autoFocus`は、選んだユーザーの代わりに欄が現れたときにフォーカスを当てる。
 */
export function UserSearchField({
  label,
  isRequired = false,
  excludedUserIds = [],
  unavailableUsers = NO_UNAVAILABLE_USERS,
  autoFocus = false,
  onPick,
}: {
  label: string;
  isRequired?: boolean;
  excludedUserIds?: readonly string[];
  /** 一覧に出たユーザーを選べない理由。キーはユーザーのid。 */
  unavailableUsers?: ReadonlyMap<string, string>;
  autoFocus?: boolean;
  onPick: (user: UserSearchResult) => void;
}) {
  useLocale();
  const inputId = useId();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const search = useUserSearch(query);
  const users = search.users.filter((user) => !excludedUserIds.includes(user.id));
  const pick = (user: UserSearchResult) => {
    onPick(user);
    setQuery('');
    // 選んだユーザーのボタンは消える。これが無いとフォーカスがページへ落ちる。
    inputRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isEnterOutsideComposition(event)) return;
    // この欄はダイアログのフォーム（Projectの作成、メンバーの追加）の中にあり、Enterでは
    // ユーザーを選ぶ前にフォームが送信されてしまう。
    event.preventDefault();
    const pickable = users.filter((user) => !unavailableUsers.has(user.id));
    const onlyMatch = pickable.length === 1 ? pickable[0] : undefined;
    if (onlyMatch) pick(onlyMatch);
  };
  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label}
        {isRequired && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={query}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={text.userSearchPlaceholder}
        aria-controls={resultsId}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div id={resultsId} aria-live="polite">
        <ErrorNotice message={search.error} />
        {search.searching ? (
          <p className="muted">{text.loading}</p>
        ) : search.hasQuery && !search.error && !users.length ? (
          <p className="muted">{text.userSearchNoResults}</p>
        ) : (
          users.length > 0 && (
            <ul className="picker-results">
              {users.map((user) => {
                const unavailableReason = unavailableUsers.get(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={unavailableReason !== undefined}
                      aria-describedby={unavailableReason ? `${resultsId}-${user.id}` : undefined}
                      onClick={() => pick(user)}
                    >
                      <UserSummary user={user} />
                      {unavailableReason && (
                        <small id={`${resultsId}-${user.id}`} className="muted">
                          {unavailableReason}
                        </small>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
