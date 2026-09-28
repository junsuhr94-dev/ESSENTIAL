import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

/**
 * 서비스 워커 등록 + 새 버전 알림.
 * 공연 중 화면이 갑자기 새로고침되면 안 되므로 자동 업데이트하지 않고 사용자가 누를 때만 적용한다.
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 z-[70] flex items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-sm shadow-2xl">
      새 버전이 있습니다.
      <Button size="sm" onClick={() => updateServiceWorker(true)}>업데이트</Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>나중에</Button>
    </div>
  );
}
