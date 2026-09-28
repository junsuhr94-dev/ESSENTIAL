import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Columns2, Keyboard, Loader2, MoveHorizontal, MoveVertical, RectangleVertical, SplitSquareVertical, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { openSource } from '@/core/document/openSource';
import type { ScoreSource } from '@/core/document/types';
import { RenderCache } from '@/core/render/renderCache';
import {
  anchorPage,
  convertStep,
  describeView,
  maxStep,
  nextStep,
  pageToStep,
  stepToView,
  type Layout,
} from '@/core/navigation/navigator';
import type { PedalAction } from '@/core/pedal/keymap';
import { getScore, getScoreFiles, updateScore, type ScoreMeta } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useElementSize } from '@/hooks/useElementSize';
import { usePageTurner } from '@/hooks/usePageTurner';
import { useWakeLock } from '@/hooks/useWakeLock';
import { TURN_MODE_LABELS, useSettings, type LayoutPref, type TurnMode } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { PagedView } from './PagedView';
import { ScrollView, type ScrollViewHandle } from './ScrollView';
import { SettingsDialog } from './SettingsDialog';

const CACHE_CAPACITY = 8;
const TURN_ICONS: Record<TurnMode, typeof Zap> = { instant: Zap, half: SplitSquareVertical, 'scroll-h': MoveHorizontal, 'scroll-v': MoveVertical };
const LAYOUT_LABELS: Record<LayoutPref, string> = { auto: '자동 (가로 = 두 쪽)', single: '한 쪽', double: '두 쪽' };

interface Loaded {
  meta: ScoreMeta;
  source: ScoreSource;
  cache: RenderCache;
}

export function ViewerScreen({ scoreId, onClose }: { scoreId: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Loaded | null = null;
    (async () => {
      const [meta, blobs] = await Promise.all([getScore(scoreId), getScoreFiles(scoreId)]);
      if (!meta || !blobs?.length) throw new Error('missing score');
      const source = await openSource(meta.kind, blobs);
      loaded = { meta, source, cache: new RenderCache(source, CACHE_CAPACITY) };
      if (cancelled) return dispose(loaded);
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
      <div className="fixed inset-0 flex items-center justify-center bg-stage">
        <Loader2 className="size-8 animate-spin text-white/60" />
      </div>
    );
  }
  return <Viewer doc={doc} onClose={onClose} />;
}

function dispose({ source, cache }: Loaded) {
  cache.destroy();
  source.destroy();
}

function Viewer({ doc, onClose }: { doc: Loaded; onClose: () => void }) {
  const { meta, source, cache } = doc;
  const pageCount = source.pageCount;
  const { layout: layoutPref, turnMode, halfSplit, keymap, tapToTurn, set } = useSettings();

  const stageRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(stageRef);
  const layout: Layout = layoutPref === 'auto' ? (width > height ? 'double' : 'single') : layoutPref;
  const scrollMode = turnMode === 'scroll-h' || turnMode === 'scroll-v';
  const pagedMode = turnMode === 'half' ? 'half' : 'instant';

  // 현재 위치: 넘김 모드에서는 step, 스크롤 모드에서는 page 를 기준으로 한다.
  // step 은 그것이 계산된 레이아웃과 함께 저장한다. 기기 회전 등으로 레이아웃이 바뀌면
  // 렌더링 중에 바로 변환하므로 잘못된 화면이 한 프레임도 보이지 않고, 보던 페이지가 유지된다.
  const [pos, setPos] = useState(() => ({ step: pageToStep(meta.lastPage || 1, pageCount, layout), layout }));
  const step = pos.layout === layout ? pos.step : convertStep(pos.step, pageCount, pos.layout, layout);
  const setStep = useCallback(
    (update: number | ((k: number) => number)) =>
      setPos((p) => {
        const cur = p.layout === layout ? p.step : convertStep(p.step, pageCount, p.layout, layout);
        return { step: typeof update === 'function' ? update(cur) : update, layout };
      }),
    [layout, pageCount],
  );
  const [scrollPage, setScrollPage] = useState(meta.lastPage || 1);
  const [chrome, setChrome] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const scrollRef = useRef<ScrollViewHandle>(null);

  useWakeLock(true);

  const view = useMemo(() => stepToView(step, pageCount, layout), [step, pageCount, layout]);
  const anchor = scrollMode ? scrollPage : anchorPage(view);

  const neighbors = useMemo(
    () =>
      [nextStep(step, 1, pagedMode, pageCount, layout), nextStep(step, -1, pagedMode, pageCount, layout)]
        .filter((k) => k !== step)
        .map((k) => stepToView(k, pageCount, layout)),
    [step, pagedMode, pageCount, layout],
  );

  // 이어보기 위치 저장
  useEffect(() => {
    const t = setTimeout(() => void updateScore(meta.id, { lastPage: anchor }), 600);
    return () => clearTimeout(t);
  }, [anchor, meta.id]);

  const turn = useCallback(
    (dir: 1 | -1) => {
      if (scrollMode) {
        if (dir > 0) scrollRef.current?.next(); else scrollRef.current?.prev();
        return;
      }
      setStep((k) => {
        const n = nextStep(k, dir, pagedMode, pageCount, layout);
        if (n === k) toast(dir > 0 ? '마지막 페이지입니다' : '첫 페이지입니다', 1200);
        return n;
      });
    },
    [scrollMode, pagedMode, pageCount, layout, setStep],
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

  const onPedal = useCallback(
    (action: PedalAction) => {
      if (action === 'next') turn(1);
      else if (action === 'prev') turn(-1);
      else if (action === 'first') goToPage(1);
      else if (action === 'last') goToPage(pageCount);
      else if (action === 'toggleChrome') setChrome((c) => !c);
    },
    [turn, goToPage, pageCount],
  );
  usePageTurner(keymap, onPedal, !settingsOpen);

  // ---- 터치: 좌우 탭 / 스와이프 / 가운데 탭 ----
  const gesture = useRef<{ id: number; x: number; y: number; t: number; multi: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (gesture.current) { gesture.current.multi = true; return; }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, multi: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.multi) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dt = e.timeStamp - g.t;
    if (!scrollMode && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
      turn(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.hypot(dx, dy) > 10 || dt > 500) return;
    const fx = (e.clientX - (stageRef.current?.getBoundingClientRect().left ?? 0)) / (width || 1);
    if (!scrollMode && tapToTurn && fx < 0.28) turn(-1);
    else if (!scrollMode && tapToTurn && fx > 0.72) turn(1);
    else setChrome((c) => !c);
  };

  const label = scrollMode ? `${scrollPage} / ${pageCount}` : describeView(view, pageCount);
  const TurnIcon = TURN_ICONS[turnMode];

  return (
    <div className="fixed inset-0 overflow-hidden bg-stage text-white">
      <div
        ref={stageRef}
        className="no-callout absolute inset-0"
        style={{ touchAction: scrollMode ? (turnMode === 'scroll-h' ? 'pan-x' : 'pan-y') : 'none' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; }}
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
            onEdge={(edge) => toast(edge === 'end' ? '마지막 페이지입니다' : '첫 페이지입니다', 1200)}
          />
        ) : (
          <PagedView source={source} cache={cache} view={view} neighbors={neighbors} width={width} height={height} split={halfSplit} />
        )}
      </div>

      {/* 상단 바 */}
      <header
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-black/75 px-2 pt-safe pb-2 backdrop-blur-md transition-all duration-200',
          !chrome && 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <Button variant="bar" onClick={onClose}>
          <ChevronLeft /> 악보함
        </Button>
        <div className="min-w-0 flex-1 truncate text-center font-semibold">{meta.title}</div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="bar" aria-label="넘김 방식">
              <TurnIcon /> <span className="hidden sm:inline">{TURN_MODE_LABELS[turnMode].title}</span>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="bar" aria-label="페이지 배치" disabled={scrollMode}>
              {layout === 'double' ? <Columns2 /> : <RectangleVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>페이지 배치</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={layoutPref} onValueChange={(v) => set({ layout: v as LayoutPref })}>
              {(Object.keys(LAYOUT_LABELS) as LayoutPref[]).map((l) => (
                <DropdownMenuRadioItem key={l} value={l}>{LAYOUT_LABELS[l]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="bar" size="icon" aria-label="페달 & 보기 설정" onClick={() => setSettingsOpen(true)}>
          <Keyboard />
        </Button>
      </header>

      {/* 페이지 표시 */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm tabular-nums transition-all duration-200',
          chrome ? 'bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] opacity-60',
        )}
      >
        {sliderPreview != null ? `${sliderPreview} / ${pageCount}` : label}
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
    </div>
  );
}
