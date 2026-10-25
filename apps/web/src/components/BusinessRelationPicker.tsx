import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './business-relation-picker.css';

export type BusinessRelationOption = {
  key: string;
  label: string;
  searchText?: string;
};

type Props = {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: BusinessRelationOption[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  maxVisible?: number;
};

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

export function BusinessRelationPicker({
  ariaLabel,
  value,
  onChange,
  options,
  emptyLabel = '不关联',
  searchPlaceholder = '搜索关联记录…',
  disabled = false,
  maxVisible = 50,
}: Props) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = useMemo(() => options.find((option) => option.key === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    return options.filter((option) => normalize(`${option.label} ${option.searchText ?? ''}`).includes(needle));
  }, [options, query]);
  const visible = useMemo(() => {
    const limited = filtered.slice(0, maxVisible);
    if (query.trim() || !selected || limited.some((option) => option.key === selected.key)) return limited;
    return [selected, ...limited].slice(0, maxVisible);
  }, [filtered, maxVisible, query, selected]);
  const menuItems = useMemo(() => [{ key: '', label: emptyLabel, searchText: '' }, ...visible], [emptyLabel, visible]);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  useEffect(() => {
    if (!open) setInputValue(selected?.label ?? '');
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!(event.target instanceof Node) || !root || root.contains(event.target)) return;
      setOpen(false);
      setQuery('');
      setInputValue(selected?.label ?? '');
      setActiveIndex(-1);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, selected]);

  const closeAndRestore = () => {
    setOpen(false);
    setQuery('');
    setInputValue(selected?.label ?? '');
    setActiveIndex(-1);
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(0);
  };

  const commit = (key: string) => {
    const next = options.find((option) => option.key === key) ?? null;
    onChange(key);
    setOpen(false);
    setQuery('');
    setInputValue(next?.label ?? '');
    setActiveIndex(-1);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!open) {
      openMenu();
      return;
    }
    if (!menuItems.length) return;
    setActiveIndex((current) => {
      const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
      return (start + direction + menuItems.length) % menuItems.length;
    });
  };

  return <div ref={rootRef} className="business-relation-picker">
    <div className={`business-relation-combobox${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={inputValue}
        onFocus={(event) => {
          const target = event.currentTarget;
          if (!open) openMenu();
          requestAnimationFrame(() => target.select());
        }}
        onClick={() => {
          if (!open) openMenu();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setInputValue(next);
          setQuery(next);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
          } else if (event.key === 'Enter' && open && activeIndex >= 0) {
            event.preventDefault();
            const item = menuItems[activeIndex];
            if (item) commit(item.key);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            closeAndRestore();
            inputRef.current?.select();
          }
        }}
        placeholder={searchPlaceholder}
        disabled={disabled}
        autoComplete="off"
      />
      <span className="business-relation-combobox-chevron" aria-hidden="true">⌄</span>

      {open && !disabled && <div id={listboxId} className="business-relation-options" role="listbox" aria-label={`${ariaLabel}候选项`}>
        <div
          id={`${listboxId}-option-0`}
          role="option"
          aria-selected={value === ''}
          tabIndex={-1}
          className={`business-relation-option${activeIndex === 0 ? ' is-active' : ''}${value === '' ? ' is-selected' : ''}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseEnter={() => setActiveIndex(0)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            commit('');
          }}
        >
          <span>{emptyLabel}</span>
          {value === '' && <span className="business-relation-option-check" aria-hidden="true">✓</span>}
        </div>
        {visible.map((option, visibleIndex) => {
          const index = visibleIndex + 1;
          return <div
            id={`${listboxId}-option-${index}`}
            key={option.key}
            role="option"
            aria-selected={option.key === value}
            tabIndex={-1}
            className={`business-relation-option${index === activeIndex ? ' is-active' : ''}${option.key === value ? ' is-selected' : ''}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              commit(option.key);
            }}
          >
            <span>{option.label}</span>
            {option.key === value && <span className="business-relation-option-check" aria-hidden="true">✓</span>}
          </div>;
        })}
        {visible.length === 0 && query.trim() && <div className="business-relation-empty" role="status">没有匹配的记录</div>}
      </div>}
    </div>

    <small className="business-relation-picker-status">
      {query.trim()
        ? `${filtered.length} 条匹配${hiddenCount > 0 ? ` · 显示前 ${visible.length} 条` : ''}`
        : options.length > maxVisible
          ? `共 ${options.length} 条 · 可直接输入关键词搜索`
          : `共 ${options.length} 条`}
    </small>
  </div>;
}
