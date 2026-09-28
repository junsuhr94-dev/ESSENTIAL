import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, FileOutput, Library, ListMusic, MoreHorizontal, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { deleteScore, listScores, updateScore, type ScoreMeta, type Setlist } from '@/lib/db';
import { SetlistsView } from '@/features/setlist/SetlistsView';
import { BackupMenu } from '@/features/backup/BackupMenu';
import { saveFile } from '@/lib/share';
import { SMUFL } from '@/lib/smufl';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/toast';
import { importFiles } from './importFiles';

type SortKey = 'recent' | 'title' | 'added';
export type LibraryTab = 'scores' | 'setlists';

interface Props {
  onOpen: (id: string) => void;
  onPlaySetlist: (setlist: Setlist, index: number) => void;
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
}

export function LibraryScreen({ onOpen, onPlaySetlist, tab, onTabChange }: Props) {
  const [scores, setScores] = useState<ScoreMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setScores(await listScores()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = async (files: File[]) => {
    if (await importFiles(files)) await refresh();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (scores ?? []).filter((s) => !q || s.title.toLowerCase().includes(q));
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }));
    else if (sort === 'added') list.sort((a, b) => b.addedAt - a.addedAt);
    else list.sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt));
    return list;
  }, [scores, query, sort]);

  return (
    <div
      className="min-h-full px-4 pt-safe pb-safe sm:px-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <span className="font-music text-5xl leading-none text-primary" aria-hidden style={{ lineHeight: 0, paddingTop: '0.4em' }}>
            {SMUFL.gClef}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Perfect Score</h1>
            <p className="text-xs text-muted-foreground">라이브 & 세션 연주자를 위한 악보 뷰어</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'scores' && (
            <>
              <label className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="제목 검색"
                  className="h-10 w-48 rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring/50 sm:w-60"
                />
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-10 rounded-md border bg-card px-3 text-sm"
                aria-label="정렬"
              >
                <option value="recent">최근 연 순</option>
                <option value="title">제목 순</option>
                <option value="added">추가한 순</option>
              </select>
              <Button onClick={() => fileInput.current?.click()}>
                <FilePlus2 /> 악보 가져오기
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf,image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = '';
                  void handleFiles(files);
                }}
              />
            </>
          )}
          <BackupMenu
            onRestored={() => {
              void refresh();
              setVersion((v) => v + 1);
            }}
          />
        </div>
      </header>

      <div className="mx-auto mb-5 max-w-7xl">
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && onTabChange(v as LibraryTab)} className="w-full max-w-sm">
          <ToggleGroupItem value="scores">
            <Library /> 악보
          </ToggleGroupItem>
          <ToggleGroupItem value="setlists">
            <ListMusic /> 세트리스트
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {tab === 'setlists' && <SetlistsView key={version} onPlay={onPlaySetlist} />}
      {tab === 'scores' && (
        <>
          {scores && scores.length === 0 && (
            <div className="mx-auto max-w-md py-24 text-center">
              <div className="font-music text-8xl text-muted-foreground/40" style={{ lineHeight: 1.6 }} aria-hidden>
                {SMUFL.gClef}
              </div>
              <p className="mt-4 text-lg font-medium">아직 악보가 없습니다</p>
              <p className="mt-2 text-sm text-muted-foreground">
                “악보 가져오기”로 파일 앱·iCloud Drive의 PDF나 악보 사진을 추가하세요. 사진 여러 장을 한 번에 고르면 한 곡으로 묶입니다.
              </p>
            </div>
          )}

          <div className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-7 pb-10 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
            {visible.map((s) => (
              <ScoreCard key={s.id} score={s} onOpen={() => onOpen(s.id)} onChanged={refresh} />
            ))}
          </div>
        </>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-4 border-dashed border-primary bg-primary/10 text-xl font-semibold">
          악보 파일을 여기에 놓으세요
        </div>
      )}
    </div>
  );
}

function ScoreCard({ score, onOpen, onChanged }: { score: ScoreMeta; onOpen: () => void; onChanged: () => void }) {
  const thumbUrl = useMemo(() => (score.thumb ? URL.createObjectURL(score.thumb) : null), [score.thumb]);
  useEffect(
    () => () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    },
    [thumbUrl],
  );

  const rename = async () => {
    const title = prompt('악보 이름', score.title);
    if (!title?.trim()) return;
    await updateScore(score.id, { title: title.trim() });
    onChanged();
  };
  const remove = async () => {
    if (!confirm(`“${score.title}”을(를) 삭제할까요?`)) return;
    await deleteScore(score.id);
    toast('삭제했습니다.');
    onChanged();
  };
  const exportPdf = async () => {
    toast('PDF 만드는 중…', 60_000);
    try {
      const { exportAnnotatedPdf } = await import('@/features/export/exportPdf');
      const r = await exportAnnotatedPdf(score.id);
      toast(r.annotatedPages ? `필기 ${r.annotatedPages}쪽을 포함한 PDF를 만들었습니다.` : '필기가 없어 원본과 같은 PDF입니다.', 2500);
      await saveFile(r.blob, r.filename);
    } catch (err) {
      console.error(err);
      toast('PDF를 만들지 못했습니다.');
    }
  };
  const restart = async () => {
    await updateScore(score.id, { lastPage: 1 });
    onOpen();
  };

  return (
    <div className="group no-callout flex flex-col gap-2">
      <button onClick={onOpen} className="block text-left outline-none" aria-label={`${score.title} 열기`}>
        <div
          className={cn(
            'aspect-[1/1.414] rounded-md bg-white bg-contain bg-center bg-no-repeat shadow-lg shadow-black/40 ring-1 ring-white/5 transition-transform group-active:scale-[0.97]',
          )}
          style={thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : undefined}
        />
      </button>
      <div className="flex items-start gap-1">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold">{score.title}</div>
          <div className="text-xs text-muted-foreground">
            {score.pageCount}쪽{score.lastPage > 1 ? ` · ${score.lastPage}쪽부터 이어보기` : ''}
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="px-2" aria-label="더보기">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={rename}>
              <Pencil /> 이름 바꾸기
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportPdf}>
              <FileOutput /> 필기 포함 PDF 내보내기
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={restart}>
              <RotateCcw /> 처음부터 보기
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={remove}>
              <Trash2 /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
