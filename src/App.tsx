import { useCallback, useState } from 'react';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { ViewerScreen } from '@/features/viewer/ViewerScreen';
import { PwaUpdatePrompt } from '@/pwa/PwaUpdatePrompt';
import { Toaster } from '@/components/Toaster';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);

  return (
    <>
      {openId ? <ViewerScreen key={openId} scoreId={openId} onClose={close} /> : <LibraryScreen onOpen={setOpenId} />}
      <PwaUpdatePrompt />
      <Toaster />
    </>
  );
}
