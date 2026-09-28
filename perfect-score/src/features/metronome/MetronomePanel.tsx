import { useEffect, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Metronome } from '@/core/metronome/metronome';
import { clampBpm, MAX_BPM, MIN_BPM, pushTap, tapTempo } from '@/core/metronome/tempo';
import { updateScore } from '@/lib/db';
import { cn } from '@/lib/utils';

const BEAT_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export interface MetronomeState {
  running: boolean;
  bpm: number;
  beats: number;
  sound: boolean;
  /** 방금 울린 박(시각 표시용). 멈추면 null */
  beat: number | null;
  /** 박마다 1씩 증가(같은 박 번호가 반복돼도 깜빡임을 다시 켜기 위함) */
  tick: number;
  toggle: () => void;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setBeats: (beats: number) => void;
  setSound: (on: boolean) => void;
}

/** 곡별 템포(BPM·박자)를 불러오고 바뀌면 저장하는 메트로놈 훅. 악보를 닫으면 멈춘다. */
export function useMetronome(scoreId: string, initialBpm = 100, initialBeats = 4): MetronomeState {
  const [bpm, setBpmState] = useState(initialBpm);
  const [beats, setBeatsState] = useState(initialBeats);
  const [sound, setSound] = useState(true);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const ref = useRef<Metronome | null>(null);

  ref.current ??= new Metronome({
    bpm,
    beats,
    sound,
    volume: 0.8,
    onBeat: (b) => {
      setBeat(b);
      setTick((t) => t + 1);
    },
  });
  useEffect(() => () => ref.current?.dispose(), []);
  useEffect(() => { ref.current?.update({ bpm, beats, sound }); }, [bpm, beats, sound]);

  // 곡별 템포 저장
  useEffect(() => {
    const t = setTimeout(() => void updateScore(scoreId, { bpm, beats }), 800);
    return () => clearTimeout(t);
  }, [scoreId, bpm, beats]);

  return {
    running,
    bpm,
    beats,
    sound,
    beat: running ? beat : null,
    tick,
    toggle() {
      const m = ref.current!;
      if (m.running) { m.stop(); setRunning(false); setBeat(null); }
      else { m.start(); setRunning(true); }
    },
    stop() { ref.current?.stop(); setRunning(false); setBeat(null); },
    setBpm: (v) => setBpmState(clampBpm(v)),
    setBeats: setBeatsState,
    setSound,
  };
}

export function MetronomePanel({ m, onClose }: { m: MetronomeState; onClose: () => void }) {
  const [taps, setTaps] = useState<number[]>([]);

  const tap = () => {
    const next = pushTap(taps, performance.now());
    setTaps(next);
    const bpm = tapTempo(next);
    if (bpm) m.setBpm(bpm);
  };

  return (
    <div
      className="w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border bg-popover/95 p-4 text-popover-foreground shadow-2xl backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">메트로놈</div>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="닫기">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="icon" onClick={() => m.setBpm(m.bpm - 1)} aria-label="느리게"><Minus /></Button>
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">{m.bpm}</div>
          <div className="text-xs text-muted-foreground">BPM</div>
        </div>
        <Button variant="secondary" size="icon" onClick={() => m.setBpm(m.bpm + 1)} aria-label="빠르게"><Plus /></Button>
      </div>
      <Slider className="mt-2" min={MIN_BPM} max={MAX_BPM} step={1} value={[m.bpm]} onValueChange={([v]) => m.setBpm(v)} />

      <BeatDots beats={m.beats} beat={m.beat} className="my-3" />

      <div className="mb-3 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">박자</span>
        {BEAT_OPTIONS.map((b) => (
          <button
            key={b}
            onClick={() => m.setBeats(b)}
            className={cn('h-8 min-w-8 rounded-md px-2 text-sm', m.beats === b ? 'bg-primary text-primary-foreground' : 'bg-secondary')}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
        <Button variant="secondary" onClick={tap}>탭 템포</Button>
        <Button variant="secondary" size="icon" onClick={() => m.setSound(!m.sound)} aria-label={m.sound ? '소리 끄기(깜빡임만)' : '소리 켜기'} title={m.sound ? '소리 끄기 — 화면 깜빡임만' : '소리 켜기'}>
          {m.sound ? <Volume2 /> : <VolumeX />}
        </Button>
        <Button onClick={m.toggle}>{m.running ? <><Pause /> 정지</> : <><Play /> 시작</>}</Button>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        템포는 곡마다 저장됩니다. 소리를 끄면 화면 가장자리 깜빡임으로만 박을 보여줍니다. (iPad 무음 스위치가 켜져 있으면 소리가 나지 않을 수 있습니다)
      </p>
    </div>
  );
}

export function BeatDots({ beats, beat, className }: { beats: number; beat: number | null; className?: string }) {
  return (
    <div className={cn('flex justify-center gap-2', className)}>
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          className={cn(
            'size-3 rounded-full transition-colors duration-75',
            beat === i ? (i === 0 && beats > 1 ? 'bg-amber-400' : 'bg-primary') : 'bg-white/15',
          )}
        />
      ))}
    </div>
  );
}

/** 무음 메트로놈용: 박마다 화면 가장자리가 짧게 빛난다. */
export function BeatFlash({ beat, beats, tick }: { beat: number | null; beats: number; tick: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (beat == null) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 90);
    return () => clearTimeout(t);
    // tick 이 박마다 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return (
    <div
      className={cn('pointer-events-none fixed inset-0 z-20 transition-opacity duration-75', on ? 'opacity-100' : 'opacity-0')}
      style={{ boxShadow: `inset 0 0 0 6px ${beat === 0 && beats > 1 ? 'rgba(251,191,36,0.9)' : 'rgba(232,196,122,0.6)'}` }}
    />
  );
}
