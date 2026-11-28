import React, { useEffect, useMemo, useRef, useState } from 'react';
import { scenarioService } from '../../services/scenarioService';
import type { KnowledgeSearchItem } from '../../types/scenarioDetails';

export interface SelectedKnowledgeEntry {
  id?: number;
  repoId?: number;
  primaryText: string;
  reading?: string;
  meaning: string;
  exampleSentence?: string;
}

export function reorderKnowledgeList<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length || fromIndex === toIndex) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

interface ScenarioKnowledgePickerProps {
  type: 'vocab' | 'grammar';
  jlptLevel: 'N5' | 'N4' | 'N3';
  scenarioTitle: string;
  scenarioDescription: string;
  items: SelectedKnowledgeEntry[];
  onAddItems: (picked: KnowledgeSearchItem[]) => void;
  onRemoveItem: (index: number) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
}

export const ScenarioKnowledgePicker: React.FC<ScenarioKnowledgePickerProps> = ({
  type,
  jlptLevel,
  scenarioTitle,
  scenarioDescription,
  items,
  onAddItems,
  onRemoveItem,
  onReorderItem,
}) => {
  const [query, setQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>(jlptLevel);
  const [results, setResults] = useState<KnowledgeSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<KnowledgeSearchItem[]>([]);
  const [suggestMeta, setSuggestMeta] = useState<{ usedAi: boolean } | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFilterLevel(jlptLevel);
  }, [jlptLevel]);

  const selectedRepoIds = useMemo(
    () => new Set(items.map((x) => x.repoId).filter((id): id is number => typeof id === 'number' && id > 0)),
    [items]
  );

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced live search against central repository
  useEffect(() => {
    if (!isOpen && !query.trim()) return;
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await scenarioService.searchKnowledge(type, query, filterLevel, 16);
      if (!active) return;
      if (res.success && res.data) {
        setResults(res.data);
      } else {
        setResults([]);
      }
      setIsSearching(false);
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [type, query, filterLevel, isOpen]);

  const handleSmartSuggest = async () => {
    setSuggestError(null);
    setIsSuggesting(true);
    const res = await scenarioService.suggestKnowledge({
      scenarioTitle: scenarioTitle.trim() || `Hội thoại tiếng Nhật ${jlptLevel}`,
      scenarioDescription: scenarioDescription.trim(),
      jlptLevel,
      type,
      query: query.trim() || undefined,
      limit: 6,
      excludeIds: Array.from(selectedRepoIds),
    });
    setIsSuggesting(false);

    if (res.success && res.data) {
      setSuggestions(res.data.items || []);
      setSuggestMeta({ usedAi: Boolean(res.data.usedAi) });
      if ((res.data.items || []).length === 0) {
        setSuggestError('Không tìm thấy gợi ý mới phù hợp trong kho.');
      }
    } else {
      setSuggestError(res.message || 'Không thể tải gợi ý thông minh.');
    }
  };

  const handlePickItem = (item: KnowledgeSearchItem) => {
    if (selectedRepoIds.has(item.id)) return;
    onAddItems([item]);
    setSuggestions((prev) => prev.filter((s) => s.id !== item.id));
  };

  const handlePickAllSuggestions = () => {
    const fresh = suggestions.filter((s) => !selectedRepoIds.has(s.id));
    if (fresh.length === 0) return;
    onAddItems(fresh);
    setSuggestions([]);
  };

  const isVocab = type === 'vocab';
  const titleText = isVocab ? 'Từ vựng trọng tâm' : 'Ngữ pháp trọng tâm';
  const placeholderText = isVocab
    ? 'Tìm từ tiếng Nhật, cách đọc, hoặc nghĩa Việt (có/không dấu)...'
    : 'Tìm mẫu ngữ pháp (vd: ください, te mo ii, xin phep)...';

  return (
    <div ref={containerRef} className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#0878EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {isVocab ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            )}
          </svg>
          <h3 className="text-xs font-bold text-slate-800">
            {titleText} ({items.length})
          </h3>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            Chỉ chọn từ Kho
          </span>
        </div>

        <button
          type="button"
          onClick={handleSmartSuggest}
          disabled={isSuggesting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/70 transition cursor-pointer disabled:opacity-50"
          title="Dùng AI lọc gợi ý từ Kho học liệu phù hợp với chủ đề kịch bản"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {isSuggesting ? 'Đang gợi ý...' : 'Gợi ý thông minh'}
        </button>
      </div>

      {/* Search bar + JLPT filter pills */}
      <div className="space-y-2 relative">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              placeholder={placeholderText}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-1 focus:ring-[#0878EE] focus:border-[#0878EE]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                title="Xóa từ khóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {([jlptLevel, 'ALL', 'N5', 'N4', 'N3'] as string[])
              .filter((v, idx, arr) => arr.indexOf(v) === idx)
              .map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => {
                    setFilterLevel(lv);
                    setIsOpen(true);
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition cursor-pointer border ${
                    filterLevel === lv
                      ? 'bg-[#0878EE] text-white border-[#0878EE]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {lv === 'ALL' ? 'Tất cả' : lv}
                </button>
              ))}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {isOpen && (
          <div className="border border-slate-200 rounded-xl bg-white shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100 z-30">
            <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500">
              <span>
                {isSearching
                  ? 'Đang tìm trong Kho học liệu...'
                  : `Kết quả Kho (${results.length}${filterLevel !== 'ALL' ? ` · ${filterLevel}` : ''})`}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>

            {!isSearching && results.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500 text-center">
                Không tìm thấy mục phù hợp. Thử chuyển bộ lọc sang "Tất cả" hoặc thêm mới trong Kho học liệu trước.
              </div>
            )}

            {results.map((item) => {
              const alreadyAdded = selectedRepoIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => handlePickItem(item)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                    alreadyAdded
                      ? 'bg-emerald-50/40 opacity-65 cursor-default'
                      : 'hover:bg-blue-50/60 cursor-pointer'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{item.primaryText}</span>
                      {item.reading && (
                        <span className="text-[11px] text-slate-500">({item.reading})</span>
                      )}
                      {item.jlptLevel && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                          {item.jlptLevel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-1">{item.meaning}</p>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${
                      alreadyAdded
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-50 text-[#0878EE]'
                    }`}
                  >
                    {alreadyAdded ? 'Đã chọn' : '+ Chọn'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Suggestions Strip */}
      {suggestError && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 px-2.5 py-1.5 rounded-lg">
          {suggestError}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-200/70 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-indigo-900">
              Gợi ý từ Kho {suggestMeta?.usedAi ? '(AI đã lọc theo chủ đề)' : '(Khớp ngữ cảnh)'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePickAllSuggestions}
                className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                + Thêm tất cả
              </button>
              <button
                type="button"
                onClick={() => setSuggestions([])}
                className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Ẩn
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((sug) => {
              const disabled = selectedRepoIds.has(sug.id);
              return (
                <button
                  key={sug.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePickItem(sug)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left text-[11px] transition ${
                    disabled
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                      : 'bg-white text-slate-800 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                  }`}
                  title={sug.meaning}
                >
                  <span className="font-bold">{sug.primaryText}</span>
                  <span className="text-slate-500 max-w-[140px] truncate">{sug.meaning}</span>
                  <span className="text-indigo-600 font-bold">+</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Items List (read-only from repo, drag-reorderable) */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto overflow-x-hidden pr-1">
        {items.length === 0 ? (
          <div className="text-[11px] text-slate-400 italic py-2 text-center border border-dashed border-slate-200 rounded-lg">
            Chưa chọn mục nào. Dùng thanh tìm kiếm hoặc nút "Gợi ý thông minh" ở trên để thêm từ Kho học liệu.
          </div>
        ) : (
          items.map((entry, idx) => (
            <div
              key={`${entry.repoId ?? 'item'}-${idx}`}
              draggable={activeDragIdx === idx}
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => {
                setDragIdx(null);
                setActiveDragIdx(null);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== idx) {
                  onReorderItem(dragIdx, idx);
                }
                setDragIdx(null);
                setActiveDragIdx(null);
              }}
              className={`flex items-start gap-2 bg-slate-50 px-2.5 py-2 rounded-xl border transition-all ${
                dragIdx === idx ? 'opacity-40 border-dashed border-[#0878EE]' : 'border-slate-200/70 hover:border-slate-300'
              }`}
            >
              <span
                onMouseDown={() => setActiveDragIdx(idx)}
                onMouseUp={() => setActiveDragIdx(null)}
                className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing text-xs select-none pt-0.5 flex-shrink-0"
                title="Kéo để sắp xếp lại"
              >
                ⋮⋮
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">{entry.primaryText}</span>
                  {entry.reading && (
                    <span className="text-[11px] text-slate-500">({entry.reading})</span>
                  )}
                  {entry.repoId ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                      Kho #{entry.repoId}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                      Chưa liên kết Kho
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{entry.meaning}</p>
                {entry.exampleSentence && (
                  <p className="text-[10px] text-slate-400 mt-0.5 italic line-clamp-1">{entry.exampleSentence}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveItem(idx)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded text-xs transition flex-shrink-0 cursor-pointer"
                title="Xóa khỏi kịch bản"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
