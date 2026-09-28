import { useToast } from '@/stores/toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  const message = useToast((s) => s.message);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-neutral-900/95 px-4 py-2.5 text-sm text-white shadow-xl ring-1 ring-white/10 transition-all duration-200',
        message ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      {message}
    </div>
  );
}
