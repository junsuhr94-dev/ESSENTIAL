import { useState } from 'react';
import { Bookmark as BookmarkIcon, BookmarkPlus, CornerDownRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pageForMeasure, sortBookmarks } from '@/core/setlist/setlist';
import type { Bookmark } from '@/lib/db';
import { newId } from '@/lib/utils';
import { toast } from '@/stores/toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageCount: number;
  currentPage: number;
  bookmarks: Bookmark[];
  onBookmarksChange: (bookmarks: Bookmark[]) => void;
  onGo: (page: number) => void;
}

const inputClass = 'h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring/50';

/**
 * 빠른 이동: 페이지 번호, 마디 번호, 북마크.
 * 마디 번호 이동은 "마디 번호가 적힌 북마크"(예: 17마디 = 2쪽)를 기준으로 페이지를 찾는다.
 * 뷰어에서 숫자 키 1~9 로 북마크에 바로 갈 수 있다.
 */
export function JumpDialog({ open, onOpenChange, pageCount, currentPage, bookmarks, onBookmarksChange, onGo }: Props) {
  const [page, setPage] = useState('');
  const [measure, setMeasure] = useState('');
  const [label, setLabel] = useState('');
  const [bmMeasure, setBmMeasure] = useState('');
  const sorted = sortBookmarks(bookmarks);
  const hasMeasures = bookmarks.some((b) => b.measure != null);

  const go = (p: number) => {
    onGo(p);
    onOpenChange(false);
  };

  const goPage = () => {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1 || n > pageCount) return toast(`1~${pageCount} 사이의 페이지를 입력하세요.`);
    go(n);
  };

  const goMeasure = () => {
    const n = Number(measure);
    if (!Number.isInteger(n) || n < 1) return toast('마디 번호를 입력하세요.');
    const bm = pageForMeasure(bookmarks, n);
    if (!bm) return toast(hasMeasures ? `${n}마디 이전에 마디 번호가 적힌 북마크가 없습니다.` : '먼저 북마크에 마디 번호를 적어 주세요.');
    toast(`${n}마디 → ${bm.page}쪽 (${bm.label})`, 1500);
    go(bm.page);
  };

  const addBookmark = () => {
    const m = bmMeasure.trim() ? Number(bmMeasure) : undefined;
    if (m != null && (!Number.isInteger(m) || m < 1)) return toast('마디 번호는 1 이상의 정수입니다.');
    onBookmarksChange([...bookmarks, { id: newId(), label: label.trim() || `${currentPage}쪽`, page: currentPage, measure: m }]);
    setLabel('');
    setBmMeasure('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CornerDownRight className="size-5" /> 빠른 이동</DialogTitle>
          <DialogDescription>페이지나 마디 번호로 이동하거나 북마크를 누르세요. 뷰어에서 숫자 키 1~9 로 북마크에 바로 갈 수 있습니다.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); goPage(); }}>
            <label className="text-sm font-medium">페이지 (1~{pageCount})</label>
            <div className="flex gap-2">
              <input className={inputClass} inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} placeholder={String(currentPage)} />
              <Button type="submit">이동</Button>
            </div>
          </form>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); goMeasure(); }}>
            <label className="text-sm font-medium">마디 번호</label>
            <div className="flex gap-2">
              <input className={inputClass} inputMode="numeric" value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="예: 25" />
              <Button type="submit">이동</Button>
            </div>
          </form>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">북마크</div>
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">아직 북마크가 없습니다. 아래에서 현재 페이지를 추가하세요.</p>}
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {sorted.map((b, i) => (
              <li key={b.id} className="flex items-center gap-2 rounded-md bg-secondary/60 pr-1">
                <button className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left" onClick={() => go(b.page)}>
                  {i < 9 && <kbd className="rounded bg-background px-1.5 text-xs text-muted-foreground">{i + 1}</kbd>}
                  <BookmarkIcon className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{b.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {b.page}쪽{b.measure != null ? ` · ${b.measure}마디` : ''}
                  </span>
                </button>
                <button
                  className="rounded p-2 text-muted-foreground hover:text-destructive"
                  aria-label={`${b.label} 삭제`}
                  onClick={() => onBookmarksChange(bookmarks.filter((x) => x.id !== b.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); addBookmark(); }}>
            <input className={`${inputClass} min-w-0 flex-[2]`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`이름 (예: 코러스, D.S.) — ${currentPage}쪽`} />
            <input className={`${inputClass} min-w-0 flex-1`} inputMode="numeric" value={bmMeasure} onChange={(e) => setBmMeasure(e.target.value)} placeholder="시작 마디(선택)" />
            <Button type="submit" variant="secondary"><BookmarkPlus /> 현재 페이지 추가</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
