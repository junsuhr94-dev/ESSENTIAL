import { clampBpm } from './tempo';

export interface MetronomeOptions {
  bpm: number;
  /** 한 마디 박 수(첫 박 강세) */
  beats: number;
  /** false 면 소리 없이 화면 깜빡임만(무대에서 눈으로 템포 확인) */
  sound: boolean;
  volume: number;
  onBeat?: (beat: number) => void;
}

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/**
 * Web Audio 메트로놈.
 * setInterval 은 수십 ms 씩 흔들리므로, 짧은 주기로 깨어나 앞으로 0.12초 안의 박을
 * 오디오 시계 기준으로 미리 예약하는 방식(lookahead scheduling)을 쓴다.
 * iOS 에서는 AudioContext 를 반드시 사용자 터치 안에서 start() 해야 소리가 난다.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private beat = 0;
  private visualTimers: ReturnType<typeof setTimeout>[] = [];
  opts: MetronomeOptions;

  constructor(opts: MetronomeOptions) {
    this.opts = { ...opts, bpm: clampBpm(opts.bpm) };
  }

  get running() {
    return this.timer != null;
  }

  update(patch: Partial<MetronomeOptions>) {
    this.opts = { ...this.opts, ...patch, bpm: clampBpm(patch.bpm ?? this.opts.bpm) };
  }

  start() {
    if (this.running) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new AC();
    void this.ctx.resume();
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.visualTimers) clearTimeout(t);
    this.visualTimers = [];
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    const period = 60 / this.opts.bpm;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      const beat = this.beat;
      if (this.opts.sound) this.click(this.nextTime, beat === 0 && this.opts.beats > 1);
      const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
      this.visualTimers.push(setTimeout(() => this.opts.onBeat?.(beat), delay));
      if (this.visualTimers.length > 16) this.visualTimers.shift();
      this.beat = (beat + 1) % Math.max(1, this.opts.beats);
      this.nextTime += period;
    }
  }

  private click(time: number, accent: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(this.opts.volume * (accent ? 1 : 0.7), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
