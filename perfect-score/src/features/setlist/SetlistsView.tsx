import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { moveItem } from '@/core/setlist/setlist';
import { deleteSetlist, listScores, listSetlists, putSetlist, type ScoreMeta, type Setlist } from '@/lib/db';
import { newId } from '@/lib/utils';
import { toast } from '@/stores/toast';

/** 세트리스트 목록: 만들기·편집·공연 시작 */
export function SetlistsView({ onPlay }: { onPlay: (setlist: Setlist, index: number) => void }) {
  const [setlists, setSetlists] = useState<Setlist[] | null>(null);
  const [scores, setScores] = useState<ScoreMeta[]>([]);
  const [editing, setEditing] = useState<Setlist | null>(null);

  const refresh = useCallback(async () => {
    const [sl, sc] = await Promise.all([listSetlists(), listScores()]);
    setSetlists(sl.sort((a, b) => b.updatedAt - a.updatedAt));
    setScores(sc);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const byId = useMemo(() => new Map(scores.map((s) => [s.id, s])), [scores]);

  const create = () => {
    const now = Date.now();
    setEditing({ id: newId(), name: `공연 ${new Date().toLocaleDateString('ko-KR')}`, scoreIds: [], createdAt: now, updatedAt: now });
  };

  const remove = async (s: Setlist) => {
    if (!confirm(`세트리스트 “${s.name}”을(를) 삭제할까요? (악보는 지워지지 않습니다)`)) return;
    await deleteSetlist(s.id);
    await refresh();
  };

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">공연 순서대로 곡을 묶어 두면 마지막 페이지에서 페달을 한 번 더 밟아 다음 곡으로 넘어갑니다.</p>
        <Button onClick={create} className="shrink-0"><Plus /> 새 세트리스트</Button>
      </div>

      {setlists?.length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          <ListMusic className="mx-auto mb-3 size-12 opacity-40" />
          세트리스트가 없습니다.
        </div>
      )}

      <ul className="space-y-3">
        {setlists?.map((s) => {
          const songs = s.scoreIds.map((id) => byId.get(id)).filter((x): x is ScoreMeta => !!x);
          return (
            <li key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{songs.length}곡</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="편집"><Pencil /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="삭제"><Trash2 /></Button>
                <Button disabled={!songs.length} onClick={() => onPlay({ ...s, scoreIds: songs.map((x) => x.id) }, 0)}>
                  <Play /> 공연 시작
                </Button>
              </div>
              {songs.length > 0 && (
                <ol className="mt-3 space-y-1">
                  {songs.map((song, i) => (
                    <li key={song.id}>
                      <button
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => onPlay({ ...s, scoreIds: songs.map((x) => x.id) }, i)}
                      >
                        <span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="truncate">{song.title}</span>
                        {song.bpm && <span className="ml-auto shrink-0 text-xs text-muted-foreground">♩={song.bpm}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <SetlistEditor
          setlist={editing}
          scores={scores}
          onClose={() => setEditing(null)}
          onSave={async (s) => {
            await putSetlist(s);
            setEditing(null);
            toast('저장했습니다.');
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function SetlistEditor({ setlist, scores, onClose, onSave }: { setlist: Setlist; scores: ScoreMeta[]; onClose: () => void; onSave: (s: Setlist) => void }) {
  const [name, setName] = useState(setlist.name);
  const [ids, setIds] = useState(setlist.scoreIds.filter((id) => scores.some((s) => s.id === id)));
  const [query, setQuery] = useState('');
  const byId = new Map(scores.map((s) => [s.id, s]));
  const candidates = scores
    .filter((s) => !query.trim() || s.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>세트리스트 편집</DialogTitle>
          <DialogDescription>오른쪽에서 곡을 눌러 추가하고, 화살표로 순서를 바꾸세요. 같은 곡을 여러 번 넣을 수도 있습니다.</DialogDescription>
        </DialogHeader>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-md border bg-background px-3 text-base font-semibold outline-none focus:ring-2 focus:ring-ring/50"
          aria-label="세트리스트 이름"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium">공연 순서 ({ids.length}곡)</div>
            <ol className="max-h-80 space-y-1 overflow-y-auto">
              {ids.length === 0 && <li className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">곡을 추가하세요</li>}
              {ids.map((id, i) => (
                <li key={`${id}-${i}`} className="flex items-center gap-1 rounded-md bg-secondary/60 py-1 pr-1 pl-2 text-sm">
                  <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{byId.get(id)?.title}</span>
                  <button className="rounded p-1.5 hover:bg-accent disabled:opacity-30" disabled={i === 0} onClick={() => setIds(moveItem(ids, i, i - 1))} aria-label="위로"><ArrowUp className="size-4" /></button>
                  <button className="rounded p-1.5 hover:bg-accent disabled:opacity-30" disabled={i === ids.length - 1} onClick={() => setIds(moveItem(ids, i, i + 1))} aria-label="아래로"><ArrowDown className="size-4" /></button>
                  <button className="rounded p-1.5 hover:bg-accent" onClick={() => setIds(ids.filter((_, j) => j !== i))} aria-label="빼기"><X className="size-4" /></button>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="악보 검색"
              className="mb-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {candidates.map((s) => (
                <li key={s.id}>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setIds([...ids, s.id])}>
                    <Plus className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{s.title}</span>
                    {ids.includes(s.id) && <span className="ml-auto text-xs text-muted-foreground">추가됨</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={() => onSave({ ...setlist, name: name.trim() || setlist.name, scoreIds: ids })}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
