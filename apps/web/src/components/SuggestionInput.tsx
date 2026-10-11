import { useId, useState, type KeyboardEvent } from 'react';
import type { SuggestFieldValues } from '../types/form';
import { useFieldSuggestions } from '../hooks/useFieldSuggestions';
import { remainingSuggestions } from '../lib/fieldSuggestions';
import { moveActiveIndex } from '../lib/listNavigation';
import { isComposingKey } from '../lib/imeComposition';

/**
 * A text field that offers candidates under itself as it is typed (an ARIA combobox). ↑↓ move
 * through the candidates, Enter or Tab takes the highlighted one, Esc hides the list without
 * closing the dialog around the field, and a click takes a candidate too. `suggest` decides where
 * the candidates come from; its note (for example that the path does not exist) shows below, and
 * a candidate's detail (a Python's version) beside it. With `offerWhenEmpty` the list opens on an
 * empty field too; a new `refreshKey` looks the typed value up again.
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
  /** The id of a hint about the field, read with it. */
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
    // While Japanese input converts the text, Enter and ↑↓ belong to the input method.
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
      // Enter would submit the form and Tab would leave the field; both take the candidate instead.
      event.preventDefault();
      take(activeCandidate);
      return;
    }
    if (event.key === 'Escape' && isListShown) {
      // Keeps the surrounding <dialog> open: Esc here only hides the candidates.
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
              // Keeps the focus in the field, so the blur does not hide the list before the click.
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
        <p id={noteId} className="suggestion-note" aria-live="polite">
          {suggestions.note}
        </p>
      )}
    </div>
  );
}
