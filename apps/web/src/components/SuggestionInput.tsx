import { useId, useState, type KeyboardEvent } from 'react';
import { moveActiveIndex } from '@mado/design-system/list-navigation';
import type { SuggestFieldValues } from '../types/form';
import { useFieldSuggestions } from '../hooks/useFieldSuggestions';
import { remainingSuggestions } from '../lib/fieldSuggestions';
import { isComposingKey } from '../lib/imeComposition';

/**
 * 入力に応じて下に候補を出すテキストの欄（ARIAのcombobox）。↑↓で候補を移り、EnterかTabで強調した
 * 候補を選び、Escは欄を囲むダイアログを閉じずに一覧だけを隠す。クリックでも候補を選べる。候補の
 * 出どころは`suggest`が決める。その注記（たとえばパスが存在しないこと）は下に、候補の詳細（Pythonの
 * バージョン）はその横に出す。`offerWhenEmpty`を付けると空の欄でも一覧を開く。`refreshKey`が
 * 変わると、入力した値をもう一度引く。
 */
export function SuggestionInput({
  id,
  value,
  onChange,
  suggest,
  required,
  readOnly,
  placeholder,
  maxLength,
  offerWhenEmpty,
  refreshKey,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggest: SuggestFieldValues;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  maxLength?: number;
  offerWhenEmpty?: boolean;
  refreshKey?: string | number;
  /** 欄についての説明のid。欄と合わせて読み上げる。 */
  describedBy?: string;
}) {
  const listId = useId();
  const noteId = useId();
  const suggestions = useFieldSuggestions(readOnly ? '' : value, readOnly ? undefined : suggest, {
    offerWhenEmpty,
    refreshKey,
  });
  const candidates = remainingSuggestions(suggestions.items, value);
  const [isListWanted, setIsListWanted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const isListShown = isListWanted && candidates.length > 0;
  const activeCandidate = isListShown ? candidates[activeIndex] : undefined;
  const optionId = (index: number) => `${listId}-option-${index}`;
  const hideList = () => {
    setIsListWanted(false);
    setActiveIndex(-1);
  };
  const take = (candidate: string) => {
    onChange(candidate);
    hideList();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力で変換している間は、Enterと↑↓は入力メソッドのもの。
    if (isComposingKey(event)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!candidates.length) return;
      event.preventDefault();
      setIsListWanted(true);
      setActiveIndex(
        moveActiveIndex({
          current: isListShown ? activeIndex : -1,
          key: event.key,
          count: candidates.length,
        }),
      );
      return;
    }
    if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) && activeCandidate) {
      // Enterはフォームを送信し、Tabは欄を離れてしまうので、どちらも代わりに候補を選ぶ。
      event.preventDefault();
      take(activeCandidate);
      return;
    }
    if (event.key === 'Escape' && isListShown) {
      // 囲んでいる<dialog>は開いたままにする。ここでのEscは候補を隠すだけ。
      event.preventDefault();
      event.stopPropagation();
      hideList();
    }
  };
  return (
    <div className="suggestion-input">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isListShown}
        aria-controls={listId}
        aria-activedescendant={activeCandidate ? optionId(activeIndex) : undefined}
        aria-describedby={
          [describedBy, suggestions.note ? noteId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
        autoComplete="off"
        spellCheck={false}
        value={value}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => {
          onChange(event.target.value);
          setIsListWanted(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsListWanted(true)}
        onBlur={hideList}
        onKeyDown={handleKeyDown}
      />
      <ul id={listId} role="listbox" className="suggestion-list" hidden={!isListShown}>
        {isListShown &&
          candidates.map((candidate, index) => (
            <li
              key={candidate}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // フォーカスを欄に留め、クリックの前にblurで一覧が隠れないようにする。
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => take(candidate)}
            >
              <span className="suggestion-value">{candidate}</span>
              {suggestions.details?.[candidate] && (
                <span className="suggestion-detail">{suggestions.details[candidate]}</span>
              )}
            </li>
          ))}
      </ul>
      {suggestions.note && (
        <p
          id={noteId}
          className={`suggestion-note${suggestions.noteTone === 'warning' ? ' warning' : ''}`}
          aria-live="polite"
        >
          {suggestions.note}
        </p>
      )}
    </div>
  );
}
