import { useRef, useState } from 'react';
import { ArchiveRestore, DatabaseBackup, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { saveFile } from '@/lib/share';
import { toast } from '@/stores/toast';

/** 전체 백업 만들기 / 백업에서 복원 (다른 iPad 로 옮기거나 기기 교체 대비) */
export function BackupMenu({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const backup = async () => {
    setBusy(true);
    try {
      const { createBackup } = await import('./backup');
      const r = await createBackup((done, total) => toast(`백업 만드는 중… ${done}/${total}`, 60_000));
      toast(`악보 ${r.scores}곡을 백업했습니다. 파일 앱이나 iCloud Drive에 저장하세요.`, 3000);
      await saveFile(r.blob, r.filename);
    } catch (err) {
      console.error(err);
      toast('백업을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    if (!confirm(`“${file.name}”에서 복원할까요?\n같은 악보는 백업 내용(필기 포함)으로 바뀌고, 백업에 없는 악보는 그대로 남습니다.`)) return;
    setBusy(true);
    toast('복원하는 중…', 60_000);
    try {
      const { restoreBackup } = await import('./backup');
      const r = await restoreBackup(file);
      toast(`복원 완료: 악보 ${r.scores}곡, 필기 ${r.inkPages}쪽, 세트리스트 ${r.setlists}개`, 3000);
      onRestored();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error && err.message ? err.message : '복원하지 못했습니다.', 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="백업·복원" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>악보·필기·세트리스트 전체</DropdownMenuLabel>
          <DropdownMenuItem onSelect={backup}>
            <Download /> 전체 백업 만들기
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <ArchiveRestore /> 백업에서 복원
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={input}
        type="file"
        accept=".psbackup,.zip,application/zip,application/octet-stream"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void restore(file);
        }}
      />
    </>
  );
}
