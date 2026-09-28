import { addScore, requestPersistentStorage, type ScoreKind } from '@/lib/db';
import { openSource, renderThumbnail } from '@/core/document/openSource';
import { newId } from '@/lib/utils';
import { toast } from '@/stores/toast';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name);
const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * PDF 는 파일마다 한 곡으로, 이미지는 한 번에 고른 것들을 파일 이름 순서로 묶어 한 곡으로 가져온다.
 * (사진으로 찍은 악보 여러 장 → 한 곡)
 */
export async function importFiles(files: File[]): Promise<number> {
  const pdfs = files.filter(isPdf);
  const images = files.filter((f) => !isPdf(f) && isImage(f)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!pdfs.length && !images.length) {
    toast('PDF 또는 이미지 파일만 가져올 수 있습니다.');
    return 0;
  }
  requestPersistentStorage();

  const jobs: { title: string; kind: ScoreKind; blobs: Blob[] }[] = [
    ...pdfs.map((f) => ({ title: stripExt(f.name), kind: 'pdf' as const, blobs: [f] })),
    ...(images.length ? [{ title: stripExt(images[0].name), kind: 'images' as const, blobs: images }] : []),
  ];

  let ok = 0;
  for (const [i, job] of jobs.entries()) {
    toast(`가져오는 중… (${i + 1}/${jobs.length}) ${job.title}`, 60_000);
    try {
      const source = await openSource(job.kind, job.blobs);
      const thumb = await renderThumbnail(source);
      const now = Date.now();
      await addScore(
        { id: newId(), title: job.title, kind: job.kind, pageCount: source.pageCount, addedAt: now, openedAt: 0, lastPage: 1, thumb },
        job.blobs,
      );
      source.destroy();
      ok++;
    } catch (err) {
      console.error(err);
      toast(`“${job.title}”을(를) 열 수 없습니다.`);
    }
  }
  if (ok) toast(`악보 ${ok}개를 추가했습니다.`);
  return ok;
}
