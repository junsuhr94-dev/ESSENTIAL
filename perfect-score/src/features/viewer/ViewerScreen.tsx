import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Columns2,
  CornerDownRight,
  Keyboard,
  Loader2,
  Lock,
  MoveHorizontal,
  MoveVertical,
  Palette,
  PenLine,
  RectangleVertical,
  SkipBack,
  SkipForward,
  SplitSquareVertical,
  Share,
  Timer,
  Unlock,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import {
  anchorPage,
  convertStep,
  describeView,
  maxStep,
  nextStep,
  pageToStep,
  stepToView,
  visiblePages,
  type Layout,
} from '@/core/navigation/navigator';
import type { PedalAction } from '@/core/pedal/keymap';
import { penRecentlyActive } from '@/core/input/penActivity';
import { sortBookmarks } from '@/core/setlist/setlist';
import { updateScore, type Bookmark } from '@/lib/db';
import { saveFile } from '@/lib/share';
import { cn } from '@/lib/utils';
import { flushInk, useInk } from '@/stores/ink';
import { PAGE_THEMES, TURN_MODE_LABELS, useSettings, type LayoutPref, type PageTheme, type TurnMode } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { useElementSize } from '@/hooks/useElementSize';
import { usePageTurner } from '@/hooks/usePageTurner';
import { useWakeLock } from '@/hooks/useWakeLock';
import { InkToolbar } from '@/features/ink/InkToolbar';
import { BeatDots, BeatFlash, MetronomePanel, useMetronome } from '@/features/metronome/MetronomePanel';
import { layoutFrame, NO_CROP, renderDpr, resolveFrame } from './frame';
import { clearPreloaded, disposeScore, loadScore, preloadScore, takePreloaded, type LoadedScore } from './loadScore';
import { JumpDialog } from './JumpDialog';
import { PagedView } from './PagedView';
import { ScrollView, type ScrollViewHandle } from './ScrollView';
import { SettingsDialog } from './SettingsDialog';

const TURN_ICONS: Record<TurnMode, typeof Zap> = { instant: Zap, half: SplitSquareVertical, 'scroll-h': MoveHorizontal, 'scroll-v': MoveVertical };
const LAYOUT_LABELS: Record<LayoutPref, string> = { auto: '자동 (가로 = 두 쪽)', single: '한 쪽', double: '두 쪽' };
/** 마지막 페이지에서 다음 곡으로 넘어가려면 이 시간 안에 한 번 더 넘겨야 한다(실수 방지) */
const NEXT_SONG_ARM_MS = 3000;
/** 공연 모드에서 메뉴를 여는 길게 누르기 시간 */
const LONG_PRESS_MS = 650;

/** 세트리스트로 연 경우의 곡 정보 */
export interface SetlistContext {
  name: string;
  songs: { id: string; title: string }[];
  index: number;
  onSong: (index: number) => void;
}

type Loaded = LoadedScore;

interface ScreenProps {
  scoreId: string;
  onClose: () => void;
  setlist?: SetlistContext;
}

export function ViewerScreen({ scoreId, onClose, setlist }: ScreenProps) {
  const [doc, setDoc] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Loaded | null = null;
    (async () => {
      // 세트리스트에서 미리 열어 둔 곡이면 바로 쓴다.
      loaded = await (takePreloaded(scoreId) ?? loadScore(scoreId));
      if (cancelled) return dispose(loaded);
      useInk.getState().load(scoreId, loaded.ink);
      setDoc(loaded);
      void updateScore(scoreId, { openedAt: Date.now() });
    })().catch((err) => {
      console.error(err);
      toast('악보를 열 수 없습니다.');
      onClose();
    });
    return () => {
      cancelled = true;
      if (loaded) dispose(loaded);
    };
  }, [scoreId, onClose]);

  if (!doc) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-stage text-white/70">
        <Loader2 className="size-8 animate-spin" />
        {setlist && (
          <div className="text-sm">
            {setlist.index + 1}/{setlist.songs.length} · {setlist.songs[setlist.index]?.title}
          </div>
        )}
      </div>
    );
  }
  return <Viewer doc={doc} onClose={onClose} setlist={setlist} />;
}

function dispose(loaded: Loaded) {
  void flushInk();
  useInk.getState().unload();
  disposeScore(loaded);
}

function Viewer({ doc, onClose, setlist }: { doc: Loaded; onClose: () => void; setlist?: SetlistContext }) {
  const { meta, source, cache } = doc;
  const pageCount = source.pageCount;
  const { layout: layoutPref, turnMode, halfSplit, keymap, tapToTurn, pageTheme, dim, performanceMode, set } = useSettings();
  const theme = PAGE_THEMES[pageTheme];

  const stageRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(stageRef);
  const layout: Layout = layoutPref === 'auto' ? (width > height ? 'double' : 'single') : layoutPref;
  const scrollMode = turnMode === 'scroll-h' || turnMode === 'scroll-v';
  const pagedMode = turnMode === 'half' ? 'half' : 'instant';

  // 세트리스트로 열면 항상 첫 페이지부터, 아니면 이어보기
  const startPage = setlist ? 1 : meta.lastPage || 1;

  // 현재 위치: 넘김 모드에서는 step, 스크롤 모드에서는 page 를 기준으로 한다.
  // step 은 그것이 계산된 레이아웃과 함께 저장한다. 기기 회전 등으로 레이아웃이 바뀌면
  // 렌더링 중에 바로 변환하므로 잘못된 화면이 한 프레임도 보이지 않고, 보던 페이지가 유지된다.
  const [pos, setPos] = useState(() => ({ step: pageToStep(startPage, pageCount, layout), layout }));
  const step = pos.layout === layout ? pos.step : convertStep(pos.step, pageCount, pos.layout, layout);
  const setStep = useCallback(
    (update: number | ((k: number) => number)) =>
      setPos((p) => {
        const cur = p.layout === layout ? p.step : convertStep(p.step, pageCount, p.layout, layout);
        return { step: typeof update === 'function' ? update(cur) : update, layout };
      }),
    [layout, pageCount],
  );
  const [scrollPage, setScrollPage] = useState(startPage);
  const [chrome, setChrome] = useState(!performanceMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const annotating = useInk((s) => s.annotating);
  const setAnnotating = useInk((s) => s.setAnnotating);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const scrollRef = useRef<ScrollViewHandle>(null);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(meta.bookmarks ?? []);
  const [autoCrop, setAutoCrop] = useState(!!meta.autoCrop);
  const metronome = useMetronome(meta.id, meta.bpm ?? 100, meta.beats ?? 4);

  useWakeLock(true);

  // 세트리스트: 이 곡이 뜨고 잠시 뒤 다음 곡을 미리 열고 첫 화면까지 그려 둔다 → 곡 전환이 즉시 이뤄진다.
  const nextSongId = setlist?.songs[setlist.index + 1]?.id;
  useEffect(() => {
    if (!nextSongId || !width || !height) return;
    const t = setTimeout(() => {
      preloadScore(nextSongId, async (next) => {
        if (scrollMode) return;
        const n = next.source.pageCount;
        const view = stepToView(pageToStep(1, n, layout), n, layout);
        const crop = next.meta.autoCrop ? next.crops.get : NO_CROP;
        await resolveFrame(await layoutFrame(next.source, view, width, height, halfSplit, crop), next.cache, renderDpr());
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [nextSongId, width, height, layout, halfSplit, scrollMode]);

  const close = () => {
    clearPreloaded();
    onClose();
  };

  // 필기 포함 PDF 내보내기
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    toast('PDF 만드는 중…', 60_000);
    try {
      await flushInk();
      const { exportAnnotatedPdf } = await import('@/features/export/exportPdf');
      const r = await exportAnnotatedPdf(meta.id);
      toast(r.annotatedPages ? `필기 ${r.annotatedPages}쪽을 포함한 PDF를 만들었습니다.` : '필기가 없어 원본과 같은 PDF입니다.', 2500);
      await saveFile(r.blob, r.filename);
    } catch (err) {
      console.error(err);
      toast('PDF를 만들지 못했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const view = useMemo(() => stepToView(step, pageCount, layout), [step, pageCount, layout]);
  const anchor = scrollMode ? scrollPage : anchorPage(view);

  const neighbors = useMemo(
    () =>
      [nextStep(step, 1, pagedMode, pageCount, layout), nextStep(step, -1, pagedMode, pageCount, layout)]
        .filter((k) => k !== step)
        .map((k) => stepToView(k, pageCount, layout)),
    [step, pagedMode, pageCount, layout],
  );

  // 여백 자르기(넘김 모드): 켜면 전체 페이지를 한가할 때 미리 계산해 둔다.
  const crop = autoCrop && !scrollMode ? doc.crops.get : NO_CROP;
  useEffect(() => {
    if (!autoCrop) return;
    const signal = { cancelled: false };
    void doc.crops.warmUp(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [autoCrop, doc.crops]);

  // 이어보기 위치 저장
  useEffect(() => {
    const t = setTimeout(() => void updateScore(meta.id, { lastPage: anchor }), 600);
    return () => clearTimeout(t);
  }, [anchor, meta.id]);

  // 공연 모드로 들어가면 필기·메뉴를 닫는다.
  useEffect(() => {
    if (performanceMode) {
      setAnnotating(false);
      setChrome(false);
    }
  }, [performanceMode, setAnnotating]);

  // ---- 세트리스트: 끝에서 한 번 더 넘기면 다음 곡 ----
  const armed = useRef<{ dir: 1 | -1; until: number } | null>(null);
  const songAt = (dir: 1 | -1) => (setlist ? setlist.songs[setlist.index + dir] : undefined);
  const switchSong = useCallback(
    (dir: 1 | -1) => {
      if (!setlist) return;
      const target = setlist.index + dir;
      if (target < 0 || target >= setlist.songs.length) {
        toast(dir > 0 ? '세트리스트의 마지막 곡입니다' : '세트리스트의 첫 곡입니다', 1500);
        return;
      }
      metronome.stop();
      setlist.onSong(target);
    },
    [setlist, metronome],
  );

  const atEdge = useCallback(
    (dir: 1 | -1) => {
      const song = songAt(dir);
      if (!song) {
        toast(dir > 0 ? '마지막 페이지입니다' : '첫 페이지입니다', 1200);
        return;
      }
      const now = performance.now();
      if (armed.current && armed.current.dir === dir && armed.current.until > now) {
        armed.current = null;
        switchSong(dir);
      } else {
        armed.current = { dir, until: now + NEXT_SONG_ARM_MS };
        toast(`${dir > 0 ? '다음' : '이전'} 곡: ${song.title} — 한 번 더 넘기면 이동합니다`, NEXT_SONG_ARM_MS);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setlist, switchSong],
  );

  const turn = useCallback(
    (dir: 1 | -1) => {
      if (scrollMode) {
        if (dir > 0) scrollRef.current?.next();
        else scrollRef.current?.prev();
        return;
      }
      const n = nextStep(step, dir, pagedMode, pageCount, layout);
      if (n === step) atEdge(dir);
      else {
        armed.current = null;
        setStep(n);
      }
    },
    [scrollMode, step, pagedMode, pageCount, layout, setStep, atEdge],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (scrollMode) scrollRef.current?.goTo(page);
      else setStep(pageToStep(page, pageCount, layout));
    },
    [scrollMode, pageCount, layout, setStep],
  );

  // 모드 전환 시 기준 페이지 유지
  const changeTurnMode = (mode: TurnMode) => {
    const nowScroll = mode === 'scroll-h' || mode === 'scroll-v';
    if (scrollMode && !nowScroll) setStep(pageToStep(scrollPage, pageCount, layout));
    if (!scrollMode && nowScroll) setScrollPage(anchor);
    set({ turnMode: mode });
  };

  const updateBookmarks = (next: Bookmark[]) => {
    setBookmarks(next);
    void updateScore(meta.id, { bookmarks: next });
  };

  const toggleAutoCrop = (on: boolean) => {
    setAutoCrop(on);
    void updateScore(meta.id, { autoCrop: on });
    if (on && scrollMode) toast('여백 자르기는 즉시 전환·반 페이지 넘김에서 적용됩니다.', 2500);
  };

  const togglePerformance = () => {
    const on = !performanceMode;
    set({ performanceMode: on });
    toast(on ? '공연 모드 — 필기가 잠기고, 화면을 길게 누르면 메뉴가 열립니다' : '공연 모드 해제', 2500);
  };

  const onPedal = useCallback(
    (action: PedalAction) => {
      if (action === 'next') turn(1);
      else if (action === 'prev') turn(-1);
      else if (action === 'first') goToPage(1);
      else if (action === 'last') goToPage(pageCount);
      else if (action === 'toggleChrome') setChrome((c) => !c);
      else if (action === 'nextSong') switchSong(1);
      else if (action === 'prevSong') switchSong(-1);
    },
    [turn, goToPage, pageCount, switchSong],
  );
  const dialogsOpen = settingsOpen || jumpOpen;
  usePageTurner(keymap, onPedal, !dialogsOpen);

  // 숫자 키 1~9: 북마크로 바로 이동 (페달 키로 지정되지 않은 경우)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogsOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m || Object.values(keymap).some((keys) => keys?.includes(e.code))) return;
      const bm = sortBookmarks(bookmarks)[Number(m[1]) - 1];
      if (bm) {
        e.preventDefault();
        goToPage(bm.page);
        toast(`🔖 ${bm.label}`, 1000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookmarks, keymap, goToPage, dialogsOpen]);

  // ---- 터치: 좌우 탭 / 스와이프 / 가운데 탭 / (공연 모드) 길게 누르기 ----
  const gesture = useRef<{ id: number; x: number; y: number; t: number; multi: boolean; longPressed: boolean } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onPointerDown = (e: React.PointerEvent) => {
    // Apple Pencil 로 쓰는 중에 닿은 손바닥은 무시
    if (e.pointerType === 'touch' && penRecentlyActive(e.timeStamp)) return;
    if (gesture.current) {
      gesture.current.multi = true;
      clearTimeout(longPressTimer.current);
      return;
    }
    const g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, multi: false, longPressed: false };
    gesture.current = g;
    if (performanceMode) {
      longPressTimer.current = setTimeout(() => {
        if (gesture.current !== g || g.multi) return;
        g.longPressed = true;
        setChrome(true);
      }, LONG_PRESS_MS);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g && g.id === e.pointerId && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) clearTimeout(longPressTimer.current);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    clearTimeout(longPressTimer.current);
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.multi || g.longPressed) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dt = e.timeStamp - g.t;
    if (!scrollMode && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
      turn(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.hypot(dx, dy) > 10 || dt > 500) return;
    const fx = (e.clientX - (stageRef.current?.getBoundingClientRect().left ?? 0)) / (width || 1);
    // 공연 모드에서는 가장자리(18%)만 넘김 영역으로 두어 악보를 짚다가 넘어가는 사고를 줄인다.
    const edge = performanceMode ? 0.18 : 0.28;
    if (!scrollMode && tapToTurn && fx < edge) turn(-1);
    else if (!scrollMode && tapToTurn && fx > 1 - edge) turn(1);
    else if (!performanceMode) setChrome((c) => !c);
    else if (chrome) setChrome(false);
  };

  const label = scrollMode ? `${scrollPage} / ${pageCount}` : describeView(view, pageCount);
  const TurnIcon = TURN_ICONS[turnMode];
  const nextSong = songAt(1);

  return (
    <div className="fixed inset-0 overflow-hidden text-white" style={{ background: theme.stage }}>
      <div
        ref={stageRef}
        className="no-callout absolute inset-0"
        style={{ touchAction: scrollMode ? (turnMode === 'scroll-h' ? 'pan-x' : 'pan-y') : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          clearTimeout(longPressTimer.current);
          gesture.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {scrollMode ? (
          <ScrollView
            key={turnMode}
            ref={scrollRef}
            source={source}
            cache={cache}
            direction={turnMode === 'scroll-h' ? 'horizontal' : 'vertical'}
            width={width}
            height={height}
            initialPage={scrollPage}
            onPageChange={setScrollPage}
            onEdge={(edge) => atEdge(edge === 'end' ? 1 : -1)}
            pageFilter={theme.filter}
          />
        ) : (
          <PagedView
            source={source}
            cache={cache}
            view={view}
            neighbors={neighbors}
            width={width}
            height={height}
            split={halfSplit}
            crop={crop}
            pageFilter={theme.filter}
          />
        )}
      </div>

      {/* 디밍: 어두운 무대에서 화면 밝기를 더 낮춘다 */}
      {dim > 0 && <div className="pointer-events-none absolute inset-0 z-[5] bg-black" style={{ opacity: dim }} />}
      {metronome.running && !metronome.sound && <BeatFlash beat={metronome.beat} beats={metronome.beats} tick={metronome.tick} />}

      {/* 상단 바 + 필기 도구 막대 (필기 중에는 메뉴를 숨겨도 도구 막대는 남는다) */}
      <div className="absolute inset-x-0 top-0 z-10 flex flex-col">
        <header className={cn('flex items-center gap-1 bg-black/75 px-2 pt-safe pb-2 backdrop-blur-md sm:gap-2', !chrome && 'hidden')}>
          <Button variant="bar" onClick={close} className="px-2 sm:px-4">
            <ChevronLeft /> <span className="hidden sm:inline">{setlist ? '세트리스트' : '악보함'}</span>
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate font-semibold">{meta.title}</div>
            {setlist && (
              <div className="truncate text-xs text-white/60">
                {setlist.name} · {setlist.index + 1}/{setlist.songs.length}
                {nextSong ? ` · 다음: ${nextSong.title}` : ' · 마지막 곡'}
              </div>
            )}
          </div>

          {setlist && (
            <>
              <Button variant="bar" size="icon" aria-label="이전 곡" disabled={setlist.index === 0} onClick={() => switchSong(-1)}>
                <SkipBack />
              </Button>
              <Button variant="bar" size="icon" aria-label="다음 곡" disabled={!nextSong} onClick={() => switchSong(1)}>
                <SkipForward />
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="bar" size="icon" aria-label="넘김 방식" title={TURN_MODE_LABELS[turnMode].title}>
                <TurnIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>페이지 넘김 방식</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={turnMode} onValueChange={(v) => changeTurnMode(v as TurnMode)}>
                {(Object.keys(TURN_MODE_LABELS) as TurnMode[]).map((m) => (
                  <DropdownMenuRadioItem key={m} value={m} className="flex-col items-start gap-0">
                    <span>{TURN_MODE_LABELS[m].title}</span>
                    <span className="text-xs text-muted-foreground">{TURN_MODE_LABELS[m].desc}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>페이지 배치</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={layoutPref} onValueChange={(v) => set({ layout: v as LayoutPref })}>
                {(Object.keys(LAYOUT_LABELS) as LayoutPref[]).map((l) => (
                  <DropdownMenuRadioItem key={l} value={l} disabled={scrollMode}>
                    {l === 'double' ? <Columns2 /> : l === 'single' ? <RectangleVertical /> : null} {LAYOUT_LABELS[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="bar" size="icon" aria-label="화면 설정">
                <Palette />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>악보 색</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={pageTheme} onValueChange={(v) => set({ pageTheme: v as PageTheme })}>
                {(Object.keys(PAGE_THEMES) as PageTheme[]).map((t) => (
                  <DropdownMenuRadioItem key={t} value={t} className="flex-col items-start gap-0">
                    <span>{PAGE_THEMES[t].title}</span>
                    <span className="text-xs text-muted-foreground">{PAGE_THEMES[t].desc}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <div className="px-3 py-2" onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>화면 어둡게</span>
                  <span>{Math.round(dim * 100)}%</span>
                </div>
                <Slider min={0} max={80} step={5} value={[Math.round(dim * 100)]} onValueChange={([v]) => set({ dim: v / 100 })} />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={autoCrop} onCheckedChange={(v) => toggleAutoCrop(!!v)} onSelect={(e) => e.preventDefault()}>
                <span className="flex flex-col">
                  <span>여백 자르기</span>
                  <span className="text-xs text-muted-foreground">악보 바깥 흰 여백을 잘라 크게 보기 (이 곡)</span>
                </span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="bar" size="icon" aria-label="빠른 이동·북마크" onClick={() => setJumpOpen(true)}>
            <CornerDownRight />
          </Button>

          <Button variant="bar" size="icon" aria-label="메트로놈" data-active={metronome.running} onClick={() => setMetronomeOpen((o) => !o)}>
            <Timer />
          </Button>

          <Button variant="bar" size="icon" aria-label="페달 & 보기 설정" onClick={() => setSettingsOpen(true)} className="hidden sm:inline-flex">
            <Keyboard />
          </Button>

          <Button
            variant="bar"
            size="icon"
            aria-label="필기 포함 PDF 내보내기"
            title="필기 포함 PDF 내보내기"
            disabled={exporting}
            onClick={exportPdf}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Share />}
          </Button>

          <Button
            variant="bar"
            size="icon"
            aria-label={performanceMode ? '공연 모드 해제' : '공연 모드'}
            data-active={performanceMode}
            onClick={togglePerformance}
          >
            {performanceMode ? <Lock /> : <Unlock />}
          </Button>

          {!performanceMode && (
            <Button variant="bar" data-active={annotating} aria-pressed={annotating} onClick={() => setAnnotating(!annotating)}>
              <PenLine /> <span className="hidden lg:inline">필기</span>
            </Button>
          )}
        </header>
        {annotating && !performanceMode && (
          <div className={cn(!chrome && 'bg-black/70 pt-safe')}>
            <InkToolbar visiblePages={scrollMode ? [scrollPage] : visiblePages(view)} onReveal={goToPage} />
          </div>
        )}
      </div>

      {/* 메트로놈 패널 */}
      {metronomeOpen && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+4rem)] right-3 z-20">
          <MetronomePanel m={metronome} onClose={() => setMetronomeOpen(false)} />
        </div>
      )}

      {/* 페이지 표시 (+ 메트로놈 박) */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-4 py-1.5 text-sm tabular-nums transition-all duration-200',
          chrome ? 'bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] opacity-60',
        )}
      >
        {performanceMode && <Lock className="size-3.5 text-primary" />}
        <span>{sliderPreview != null ? `${sliderPreview} / ${pageCount}` : label}</span>
        {metronome.running && (
          <span className="flex items-center gap-2 border-l border-white/20 pl-3">
            <span className="text-xs text-white/70">♩={metronome.bpm}</span>
            <BeatDots beats={metronome.beats} beat={metronome.beat} />
          </span>
        )}
      </div>

      {/* 하단 바: 페이지 이동 슬라이더 */}
      <footer
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 flex items-center gap-4 bg-black/75 px-5 pt-2 pb-safe backdrop-blur-md transition-all duration-200',
          !chrome && 'pointer-events-none translate-y-full opacity-0',
        )}
      >
        <span className="text-xs text-white/60 tabular-nums">1</span>
        <Slider
          min={1}
          max={Math.max(1, pageCount)}
          step={1}
          value={[sliderPreview ?? anchor]}
          disabled={pageCount <= 1 || (!scrollMode && maxStep(pageCount, layout) === 0)}
          onValueChange={([v]) => setSliderPreview(v)}
          onValueCommit={([v]) => {
            setSliderPreview(null);
            goToPage(v);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        />
        <span className="text-xs text-white/60 tabular-nums">{pageCount}</span>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <JumpDialog
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        pageCount={pageCount}
        currentPage={anchor}
        bookmarks={bookmarks}
        onBookmarksChange={updateBookmarks}
        onGo={goToPage}
      />
    </div>
  );
}
