import { useEffect } from 'react';
import { Eraser, Hand, Highlighter, MousePointer2, PenLine, Redo2, Trash2, Type, Undo2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InkTool } from '@/core/ink/types';
import { cn } from '@/lib/utils';
import { HIGHLIGHTER_COLORS, PEN_COLORS, useInk, useInkSettings } from '@/stores/ink';
import { toast } from '@/stores/toast';

const TOOLS: { tool: InkTool; icon: typeof PenLine; label: string }[] = [
  { tool: 'pen', icon: PenLine, label: '펜' },
  { tool: 'highlighter', icon: Highlighter, label: '형광펜' },
  { tool: 'eraser', icon: Eraser, label: '지우개' },
  { tool: 'text', icon: Type, label: '코드 네임·텍스트' },
  { tool: 'select', icon: MousePointer2, label: '선택·이동' },
];

interface Props {
  /** 지금 화면에 보이는 페이지 — "이 페이지 지우기" 대상 */
  visiblePages: number[];
  /** 실행 취소한 필기가 다른 페이지에 있으면 그 페이지로 이동 */
  onReveal: (page: number) => void;
}

export function InkToolbar({ visiblePages, onReveal }: Props) {
  const s = useInkSettings();
  const canUndo = useInk((st) => st.undoStack.length > 0);
  const canRedo = useInk((st) => st.redoStack.length > 0);
  const selected = useInk((st) => st.selected);

  const undo = () => { const p = useInk.getState().undo(); if (p != null && !visiblePages.includes(p)) onReveal(p); };
  const redo = () => { const p = useInk.getState().redo(); if (p != null && !visiblePages.includes(p)) onReveal(p); };

  const deleteSelected = () => {
    if (!selected) return;
    useInk.getState().commit(selected.page, (cur) => ({
      ...cur,
      symbols: cur.symbols.filter((x) => x.id !== selected.id),
      texts: cur.texts.filter((x) => x.id !== selected.id),
    }));
    useInk.getState().select(null);
  };

  const clearVisible = () => {
    const { pages, commit } = useInk.getState();
    const targets = visiblePages.filter((p) => pages[p] && (pages[p].strokes.length || pages[p].symbols.length || pages[p].texts.length));
    if (!targets.length) return toast('지울 필기가 없습니다.');
    if (!confirm('보이는 페이지의 필기를 모두 지울까요? (실행 취소 가능)')) return;
    for (const p of targets) commit(p, () => ({ strokes: [], symbols: [], texts: [] }));
  };

  // Cmd/Ctrl+Z, 선택 삭제 단축키 (페달 키와 겹치지 않게 Delete 만 사용)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === 'Delete' && selected) {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const colors = s.tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const colorIdx = s.tool === 'highlighter' ? s.highlighterColor : s.penColor;
  const setColor = (i: number) => s.set(s.tool === 'highlighter' ? { highlighterColor: i } : { penColor: i });
  const sizeKey = ({ pen: 'penWidth', highlighter: 'highlighterWidth', eraser: 'eraserSize', text: 'textSize' } as const)[s.tool as 'pen'];
  const showColors = s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'text';

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-black/70 px-3 py-2 text-white backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1" role="radiogroup" aria-label="필기 도구">
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <Button key={tool} variant="bar" size="icon" className="size-10" data-active={s.tool === tool} aria-label={label} title={label} onClick={() => s.set({ tool })}>
            <Icon />
          </Button>
        ))}
      </div>

      {showColors && (
        <div className="flex items-center gap-1.5">
          {colors.map((c, i) => (
            <button
              key={c}
              aria-label={`색 ${i + 1}`}
              onClick={() => setColor(i)}
              className={cn('size-7 rounded-full border-2 border-white/25 transition-transform', i === colorIdx && 'scale-110 border-white ring-2 ring-primary')}
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {sizeKey && (
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              aria-label={['가늘게', '보통', '굵게'][i]}
              onClick={() => s.set({ [sizeKey]: i })}
              className={cn('flex size-9 items-center justify-center rounded-md hover:bg-white/10', s[sizeKey] === i && 'bg-primary text-primary-foreground')}
            >
              <span className="rounded-full bg-current" style={{ width: 5 + i * 5, height: 5 + i * 5 }} />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="bar"
          data-active={s.smartNotation}
          onClick={() => { s.set({ smartNotation: !s.smartNotation }); toast(!s.smartNotation ? '손글씨 기호 자동 정돈 켜짐' : '자동 정돈 꺼짐 — 손글씨 그대로 남깁니다', 1500); }}
          title="손으로 그린 음표·#·b·쉼표 등을 악보 기호로 자동 변환"
        >
          <Wand2 /> <span className="hidden md:inline">기호 정돈</span>
        </Button>
        <Button variant="bar" size="icon" className="size-10" data-active={s.fingerDraw} onClick={() => s.set({ fingerDraw: !s.fingerDraw })} aria-label="손가락으로 필기" title="손가락으로 필기">
          <Hand />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="bar" size="icon" className="size-10" onClick={undo} disabled={!canUndo} aria-label="실행 취소"><Undo2 /></Button>
        <Button variant="bar" size="icon" className="size-10" onClick={redo} disabled={!canRedo} aria-label="다시 실행"><Redo2 /></Button>
        <Button
          variant="bar"
          size="icon"
          className="size-10"
          onClick={selected ? deleteSelected : clearVisible}
          aria-label={selected ? '선택한 기호 삭제' : '보이는 페이지 필기 지우기'}
          title={selected ? '선택한 기호 삭제' : '보이는 페이지 필기 지우기'}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
