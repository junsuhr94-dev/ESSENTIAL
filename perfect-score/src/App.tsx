import { useCallback, useState } from 'react';
import { LibraryScreen, type LibraryTab } from '@/features/library/LibraryScreen';
import { ViewerScreen, type SetlistContext } from '@/features/viewer/ViewerScreen';
import { PwaUpdatePrompt } from '@/pwa/PwaUpdatePrompt';
import { Toaster } from '@/components/Toaster';
import { listScores, type Setlist } from '@/lib/db';

type Route =
  | { kind: 'library' }
  | { kind: 'score'; scoreId: string }
  | { kind: 'setlist'; name: string; songs: { id: string; title: string }[]; index: number };

export default function App() {
  const [route, setRoute] = useState<Route>({ kind: 'library' });
  const [tab, setTab] = useState<LibraryTab>('scores');
  const close = useCallback(() => setRoute({ kind: 'library' }), []);

  const playSetlist = async (setlist: Setlist, index: number) => {
    const titles = new Map((await listScores()).map((s) => [s.id, s.title]));
    const songs = setlist.scoreIds.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! }));
    if (songs.length) setRoute({ kind: 'setlist', name: setlist.name, songs, index: Math.min(index, songs.length - 1) });
  };

  let setlistCtx: SetlistContext | undefined;
  if (route.kind === 'setlist') {
    setlistCtx = {
      name: route.name,
      songs: route.songs,
      index: route.index,
      onSong: (index) => setRoute({ ...route, index }),
    };
  }

  return (
    <>
      {route.kind === 'library' && (
        <LibraryScreen tab={tab} onTabChange={setTab} onOpen={(scoreId) => setRoute({ kind: 'score', scoreId })} onPlaySetlist={playSetlist} />
      )}
      {route.kind === 'score' && <ViewerScreen key={route.scoreId} scoreId={route.scoreId} onClose={close} />}
      {route.kind === 'setlist' && setlistCtx && (
        // 같은 곡이 세트리스트에 두 번 있어도 다시 불러오도록 순번까지 key 에 넣는다.
        <ViewerScreen key={`${route.index}:${route.songs[route.index].id}`} scoreId={route.songs[route.index].id} onClose={close} setlist={setlistCtx} />
      )}
      <PwaUpdatePrompt />
      <Toaster />
    </>
  );
}
