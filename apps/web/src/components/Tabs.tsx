import { useId, useRef, type CSSProperties } from 'react';
import { useHiddenEdges } from '../hooks/useHiddenEdges';
import { useRevealSelectedTab } from '../hooks/useRevealSelectedTab';

// タブが隠れている端をぼかす幅（styles/tabs.css）。選んだタブは端からこの距離だけ離し、
// ぼけて描かれないようにする。
const EDGE_FADE_PX = 32;
const edgeFadeStyle = { '--tab-edge-fade': `${EDGE_FADE_PX}px` } as CSSProperties;

/**
 * タブの並び。収まらないとき（スマートフォン）は横にスクロールする。選んだタブが見える位置まで
 * スクロールし、タブが隠れている端はぼかして続きがあることを示す。
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
          // タブはフォーム（MarkdownEditor）の中にも置かれるので、切り替えで送信させない。
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
