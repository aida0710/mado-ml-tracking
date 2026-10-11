import { useId, useRef, type CSSProperties } from 'react';
import { useHiddenEdges } from '../hooks/useHiddenEdges';
import { useRevealSelectedTab } from '../hooks/useRevealSelectedTab';

// How far an end that hides tabs fades out (styles/tabs.css); the selected tab is kept this far
// from the edges so it is never drawn faded.
const EDGE_FADE_PX = 32;
const edgeFadeStyle = { '--tab-edge-fade': `${EDGE_FADE_PX}px` } as CSSProperties;

/**
 * A row of tabs. When they do not fit (a phone), the row scrolls sideways: the selected tab is
 * scrolled into view, and an end that hides tabs fades out to show there are more.
 */
export function Tabs({
  tabs,
  selected,
  onSelect,
  panelId = 'run-tab-panel',
}: {
  tabs: Array<{ key: string; label: string }>;
  selected: string;
  onSelect: (key: string) => void;
  panelId?: string;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const selectedIndex = tabs.findIndex((tab) => tab.key === selected);
  useRevealSelectedTab(container, selectedIndex, EDGE_FADE_PX);
  const hiddenEdges = useHiddenEdges(container, tabs.map((tab) => `${tab.key}:${tab.label}`).join('\n'));
  return (
    <div
      ref={container}
      className="tabs"
      role="tablist"
      data-hidden-edges={hiddenEdges ?? undefined}
      style={edgeFadeStyle}
      onKeyDown={(event) => {
        const nextIndex =
          event.key === 'ArrowRight'
            ? (selectedIndex + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (selectedIndex - 1 + tabs.length) % tabs.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : undefined;
        if (nextIndex === undefined) return;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        if (nextTab) {
          onSelect(nextTab.key);
          container.current?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
        }
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          // Tabs also sit inside forms (MarkdownEditor); switching must not submit them.
          type="button"
          id={`${id}-${tab.key}`}
          className={`tab ${tab.key === selected ? 'active' : ''}`}
          role="tab"
          tabIndex={tab.key === selected ? 0 : -1}
          aria-selected={tab.key === selected}
          aria-controls={panelId}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
