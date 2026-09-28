/**
 * 파일 저장/공유.
 * iPad·iPhone 에서는 공유 시트(파일에 저장, AirDrop, 메일 등)를 띄우고,
 * 그 밖에서는 일반 다운로드로 저장한다.
 */
export async function saveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const touch = navigator.maxTouchPoints > 0;
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // 공유 실패(권한 등) → 다운로드로 대체
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
