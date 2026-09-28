import { useEffect, useState } from 'react';
import { Keyboard, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { ACTION_LABELS, bindKey, DEFAULT_KEYMAP, keyLabel, normalizeKey, unbindKey, type PedalAction } from '@/core/pedal/keymap';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/utils';

const EDITABLE: PedalAction[] = ['next', 'prev', 'nextSong', 'prevSong', 'toggleChrome'];

/**
 * 페달 연결 확인·키 지정 + 보기 설정.
 * 이 창이 열려 있는 동안 페이지 넘김은 멈추고, 들어오는 키를 그대로 보여준다.
 */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { keymap, halfSplit, tapToTurn, set } = useSettings();
  const [learning, setLearning] = useState<PedalAction | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setLearning(null); setLastKey(null); return; }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(e.key)) return;
      const key = normalizeKey(e);
      setLastKey(key);
      if (learning) {
        e.preventDefault();
        e.stopPropagation();
        set({ keymap: bindKey(useSettings.getState().keymap, learning, key) });
        setLearning(null);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, learning, set]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Keyboard className="size-5" /> 페달 & 보기 설정</DialogTitle>
          <DialogDescription>
            페달(AirTurn·PageFlip·Donner 등)을 블루투스 키보드 모드로 연결한 뒤 밟아 보세요. 입력된 키가 아래에 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-background/50 p-3 text-center">
          <div className="text-xs text-muted-foreground">마지막으로 받은 키</div>
          <div className={cn('mt-1 font-mono text-2xl', lastKey ? 'text-primary' : 'text-muted-foreground/50')}>{lastKey ? keyLabel(lastKey) : '—'}</div>
          {learning && <div className="mt-1 text-sm text-primary">“{ACTION_LABELS[learning]}”에 쓸 페달을 밟으세요…</div>}
        </div>

        <div className="space-y-3">
          {EDITABLE.map((action) => (
            <div key={action} className="flex flex-wrap items-center gap-2">
              <div className="w-28 shrink-0 text-sm font-medium">{ACTION_LABELS[action]}</div>
              {(keymap[action] ?? []).map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-md bg-secondary py-1 pr-1 pl-2 text-sm">
                  {keyLabel(k)}
                  <button
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`${keyLabel(k)} 삭제`}
                    onClick={() => set({ keymap: unbindKey(keymap, action, k) })}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <Button size="sm" variant={learning === action ? 'default' : 'outline'} onClick={() => setLearning(learning === action ? null : action)}>
                <Plus className="size-4" /> {learning === action ? '대기 중…' : '페달로 지정'}
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => set({ keymap: DEFAULT_KEYMAP })}>
            <RotateCcw className="size-4" /> 기본값으로
          </Button>
        </div>

        <hr />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">반 페이지 넘김 경계</span>
            <span className="text-muted-foreground">위 {Math.round(halfSplit * 100)}% / 아래 {Math.round((1 - halfSplit) * 100)}%</span>
          </div>
          <Slider min={30} max={70} step={5} value={[Math.round(halfSplit * 100)]} onValueChange={([v]) => set({ halfSplit: v / 100 })} />
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">화면 좌우 탭으로 넘기기</span>
            <span className="block text-xs text-muted-foreground">끄면 페달·스와이프로만 넘어가 무대에서 오작동을 줄입니다.</span>
          </span>
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={tapToTurn} onChange={(e) => set({ tapToTurn: e.target.checked })} />
        </label>
      </DialogContent>
    </Dialog>
  );
}
