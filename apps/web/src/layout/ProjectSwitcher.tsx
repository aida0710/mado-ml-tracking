import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import type { Project } from '@mmt/contracts';
import { isListNavigationKey, moveActiveIndex } from '@mado/design-system/list-navigation';
import { useAnchoredPopover, usePopover } from '@mado/design-system/react';
import { VisibilityLabel } from '../components/VisibilityLabel';
import { filterProjects, shouldOfferProjectFilter } from '../lib/projectFilter';
import { memberProjectsFirst } from '../lib/projectListSections';
import { idsOfSharedNames } from '../lib/projectNameCollisions';
import { formatDate } from '../lib/format';
import { isComposingKey } from '../lib/imeComposition';
import { projectHomePath } from './navigationLinks';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

// サイドバーが狭いときでも、Projectの名前、鍵、「参加していない」の注記、ロールを
// 1行に収められる幅。
const SWITCHER_MIN_WIDTH = 340;
// 10行ほど。それより長い一覧はドロップダウンの中でスクロールする。
const SWITCHER_MAX_HEIGHT = 420;

type SwitcherEntry = { kind: 'project'; project: Project } | { kind: 'create' };

/**
 * ドロップダウンからProjectを開く。一覧にはすべてのProjectを公開範囲と利用者のロール付きで並べ、
 * 開いているProjectに印を付け、利用者が参加しているProjectを参加していないものより先に出す。
 * Projectが多いときは絞り込みの欄を出す。Projectを作れる人には、最後の項目でProjectを作れる
 * （`onCreateProject`）。↑↓・Home・Endで移り、Enterで開き、Escで閉じる。開くと、今開いている
 * Projectの行を強調する。ドロップダウンは、サイドバーでも狭い画面のProjectのバーでも
 * ウィンドウの中に収まる。
 */
export function ProjectSwitcher({
  projects,
  project,
  onCreateProject,
}: {
  projects: Project[];
  project?: Project;
  onCreateProject?: () => void;
}) {
  useLocale();
  const navigate = useNavigate();
  const idPrefix = useId();
  const labelId = `${idPrefix}-label`;
  const valueId = `${idPrefix}-value`;
  const listboxId = `${idPrefix}-listbox`;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const { pathname } = useLocation();
  const dropdown = usePopover({ closeKey: pathname });
  const { container, isOpen, close } = dropdown;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const popoverStyle = useAnchoredPopover({
    isOpen,
    anchorRef: triggerRef,
    popoverRef,
    minWidth: SWITCHER_MIN_WIDTH,
    maxHeight: SWITCHER_MAX_HEIGHT,
  });
  const offersFilter = shouldOfferProjectFilter(projects.length);
  const orderedProjects = memberProjectsFirst(projects);
  const shownProjects = filterProjects(orderedProjects, query);
  const sharedNameIds = idsOfSharedNames(projects);
  const firstOtherProjectId = shownProjects.find((item) => !item.isMember)?.id;
  const entries: SwitcherEntry[] = [
    ...shownProjects.map((item): SwitcherEntry => ({ kind: 'project', project: item })),
    ...(onCreateProject ? [{ kind: 'create' } as const] : []),
  ];
  const activeOptionId = entries[activeIndex] ? optionId(activeIndex) : undefined;
  const isCurrentEntry = (entry: SwitcherEntry) =>
    entry.kind === 'project' && entry.project.id === project?.id;

  useEffect(() => {
    if (!isOpen) return;
    (offersFilter ? filterRef.current : listboxRef.current)?.focus();
  }, [isOpen, offersFilter]);
  useEffect(() => {
    if (isOpen && activeOptionId)
      document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeOptionId]);

  const open = () => {
    setQuery('');
    setActiveIndex(Math.max(0, orderedProjects.findIndex((item) => item.id === project?.id)));
    dropdown.open();
  };
  const closeToTrigger = () => {
    close();
    triggerRef.current?.focus();
  };
  const choose = (entry: SwitcherEntry) => {
    closeToTrigger();
    if (entry.kind === 'create') onCreateProject?.();
    else if (entry.project.id !== project?.id) navigate(projectHomePath(entry.project.id));
  };
  const handleListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // 日本語入力で絞り込みの文字を変換している間、Enterと↑↓は入力メソッドのものになる。
    if (isComposingKey(event)) return;
    if (isListNavigationKey(event.key)) {
      event.preventDefault();
      setActiveIndex(
        moveActiveIndex({ current: activeIndex, key: event.key, count: entries.length }),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) choose(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeToTrigger();
    }
  };
  // Tabやほかの場所のクリックでフォーカスが外へ出ると、ドロップダウンを閉じる。
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (isOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  };
  // 行、絞り込み欄の周りの余白、「一致する項目がありません」の行、枠が押されたときに、フォーカスを
  // キー操作を受ける場所に留める。留めないとフォーカスがページへ落ち、ドロップダウンが閉じる。
  // 絞り込み欄そのものだけは、カーソルを置くために押す操作を受け取る。行のクリックでその行を
  // 選ぶ動きは変わらない。
  const keepFocusOnPress = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== filterRef.current) event.preventDefault();
  };

  return (
    <div className="project-switcher" ref={container} onBlur={closeWhenFocusLeaves}>
      <span id={labelId} className="project-switcher-label">
        {text.project}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="project-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={(event) => {
          if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            open();
          }
        }}
      >
        <span id={valueId} className="project-switcher-value">
          {project ? project.name : text.projectSwitcherPlaceholder}
        </span>
        {project && <VisibilityLabel visibility={project.visibility} iconOnly />}
        <ChevronsUpDown size={14} aria-hidden="true" className="project-switcher-chevron" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          popover="manual"
          className="popover anchored-popover project-switcher-popover"
          style={popoverStyle}
          onMouseDown={keepFocusOnPress}
        >
          {offersFilter && (
            <input
              ref={filterRef}
              type="search"
              className="project-switcher-filter"
              role="combobox"
              aria-label={text.projectSwitcherFilter}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              placeholder={text.projectSwitcherFilter}
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleListKeyDown}
            />
          )}
          {shownProjects.length === 0 && <p className="project-switcher-empty">{text.noResults}</p>}
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={text.project}
            className="project-switcher-list"
            tabIndex={offersFilter ? -1 : 0}
            aria-activedescendant={offersFilter ? undefined : activeOptionId}
            onKeyDown={handleListKeyDown}
          >
            {entries.map((entry, index) => (
              <li
                key={entry.kind === 'project' ? entry.project.id : 'create'}
                id={optionId(index)}
                role="option"
                aria-selected={isCurrentEntry(entry)}
                className={[
                  'project-switcher-option',
                  entry.kind === 'create' && 'project-switcher-create',
                  // 線を引いて、利用者が参加しているProjectとその下のほかのProjectを分ける。
                  entry.kind === 'project' &&
                    entry.project.id === firstOtherProjectId &&
                    shownProjects[0]?.isMember &&
                    'project-switcher-others',
                  index === activeIndex && 'active',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(entry)}
              >
                <SwitcherEntryContent
                  entry={entry}
                  isCurrent={isCurrentEntry(entry)}
                  sharesName={entry.kind === 'project' && sharedNameIds.has(entry.project.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 1行分。公開範囲と利用者のロールを付けたProject（開いていればチェックを付ける）か、新規作成。
 * 利用者が参加していないProjectはそのことを示す。ほかのProjectと同じ名前のものは作成日を出し、
 * 見分けられるようにする。
 */
function SwitcherEntryContent({
  entry,
  isCurrent,
  sharesName,
}: {
  entry: SwitcherEntry;
  isCurrent: boolean;
  sharesName: boolean;
}) {
  useLocale();
  if (entry.kind === 'create')
    return (
      <>
        <Plus size={14} aria-hidden="true" />
        <span className="project-switcher-name">{text.newProject}</span>
      </>
    );
  return (
    <>
      <Check
        size={14}
        aria-hidden="true"
        className="project-switcher-check"
        data-current={isCurrent}
      />
      <span className="project-switcher-name">
        {entry.project.name}
        {sharesName && (
          <span className="project-switcher-note">
            {textTemplates.projectSwitcherCreatedAt(formatDate(entry.project.createdAt))}
          </span>
        )}
      </span>
      <VisibilityLabel visibility={entry.project.visibility} iconOnly />
      {!entry.project.isMember && (
        <span className="project-switcher-note" title={text.projectSwitcherNotMemberHint}>
          {text.projectSwitcherNotMember}
        </span>
      )}
      <span className="project-switcher-role">{text[entry.project.role]}</span>
    </>
  );
}
