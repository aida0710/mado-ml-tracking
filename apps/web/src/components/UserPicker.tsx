import type { UserSearchResult } from '@mmt/contracts';
import { UserSearchField } from './UserSearchField';
import { UserSummary } from './UserSummary';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 名前・メールアドレス・ユーザー名の先頭でユーザーを1人探し、選んだ人を出す。検索欄と選んだ
 * ユーザーは入れ替わるので、現れた方がフォーカスを受け取る（そうしないとフォーカスがページへ
 * 落ちる）。これを含んで開くダイアログでも、最初のフォーカスはダイアログが決める。`autoFocus`は
 * `showModal`より先に動き、`showModal`がフォーカスを動かし直すため。
 */
export function UserPicker({
  label,
  unavailableUsers,
  selectedUser,
  onSelect,
}: {
  label: string;
  /** 検索に出るが選べないユーザーと、その理由（UserSearchField）。 */
  unavailableUsers?: ReadonlyMap<string, string>;
  selectedUser: UserSearchResult | null;
  onSelect: (user: UserSearchResult | null) => void;
}) {
  useLocale();
  if (selectedUser)
    return (
      <div className="field">
        <span>{label}</span>
        <div className="picker-selected">
          <UserSummary user={selectedUser} />
          <button
            type="button"
            className="button small"
            autoFocus
            onClick={() => onSelect(null)}
          >
            {text.changeSelectedUser}
          </button>
        </div>
      </div>
    );
  return (
    <UserSearchField
      label={label}
      isRequired
      autoFocus
      unavailableUsers={unavailableUsers}
      onPick={onSelect}
    />
  );
}
