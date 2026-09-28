import type { PageInk } from '@/core/ink/types';
import { MUSIC_FONT_FAMILY, SMUFL } from '@/lib/smufl';
import { layoutChordText } from './glyphMetrics';
import { drawStroke } from './nodes';

/**
 * 한 페이지의 필기(획·음악 기호·코드 네임)를 캔버스에 그린다. W = 페이지 폭(px).
 * 화면(Konva)과 같은 그리기 함수를 써서 PDF 내보내기 결과가 화면과 똑같이 보인다.
 */
export function renderInk(ctx: CanvasRenderingContext2D, ink: PageInk, W: number) {
  for (const s of ink.strokes) drawStroke(ctx, s, W);

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const item of ink.symbols) {
    ctx.font = `${item.size * W}px ${MUSIC_FONT_FAMILY}`;
    ctx.fillStyle = item.color;
    ctx.fillText(SMUFL[item.glyph], item.x * W, item.y * W);
  }
  for (const item of ink.texts) {
    const { runs } = layoutChordText(item.text, item.size * W);
    ctx.fillStyle = item.color;
    for (const r of runs) {
      ctx.font = r.font;
      ctx.fillText(r.text, item.x * W + r.x, item.y * W + r.dy);
    }
  }
  ctx.restore();
}
