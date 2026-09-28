import Konva from 'konva';
import type { InkStroke, SymbolItem, TextItem } from '@/core/ink/types';
import { MUSIC_FONT_FAMILY, SMUFL } from '@/lib/smufl';
import { glyphBounds, layoutChordText, textBounds } from './glyphMetrics';

// 메모리 절약: iOS 캔버스 메모리 한도가 낮아 필기 레이어는 최대 2배 해상도로 그린다.
Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

const HIGHLIGHTER_ALPHA = 0.45;

/**
 * 스트로크를 px 좌표(W = 페이지 폭 px)로 그린다.
 * 펜은 필압에 따라 굵기가 변하도록 중점 사이를 2차 곡선 조각으로,
 * 형광펜은 겹친 부분이 진해지지 않게 한 경로로 그린다.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Pick<InkStroke, 'tool' | 'color' | 'width' | 'points'>, W: number) {
  const p = s.points;
  if (p.length < 3) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  const base = s.width * W;

  if (s.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(p[0] * W, p[1] * W);
    if (p.length === 3) ctx.lineTo(p[0] * W + 0.01, p[1] * W);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * W, p[i + 1] * W);
    ctx.stroke();
  } else if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0] * W, p[1] * W, penWidth(base, p[2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    let mx = p[0] * W, my = p[1] * W;
    for (let i = 3; i < p.length; i += 3) {
      const x1 = p[i] * W, y1 = p[i + 1] * W;
      const last = i + 3 >= p.length;
      const nx = last ? x1 : (x1 + p[i + 3] * W) / 2;
      const ny = last ? y1 : (y1 + p[i + 4] * W) / 2;
      ctx.lineWidth = penWidth(base, (p[i - 1] + p[i + 2]) / 2);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(x1, y1, nx, ny);
      ctx.stroke();
      mx = nx; my = ny;
    }
  }
  ctx.restore();
}

function penWidth(base: number, pressure: number) {
  return base * (0.45 + 0.9 * pressure);
}

export function strokeNode(s: InkStroke, W: number) {
  return new Konva.Shape({
    listening: false,
    perfectDrawEnabled: false,
    sceneFunc: (ctx) => drawStroke(ctx._context, s, W),
  });
}

/** SMuFL 글리프 노드. 기준점 = (x, y), 크기 = size (모두 u) */
export function symbolNode(item: SymbolItem, W: number, opts: { draggable: boolean; selected: boolean }) {
  const px = item.size * W;
  const b = glyphBounds(item.glyph);
  return new Konva.Shape({
    id: item.id,
    x: item.x * W,
    y: item.y * W,
    draggable: opts.draggable,
    fill: item.color,
    perfectDrawEnabled: false,
    sceneFunc: (ctx) => {
      const c = ctx._context;
      c.font = `${px}px ${MUSIC_FONT_FAMILY}`;
      c.textBaseline = 'alphabetic';
      c.fillStyle = item.color;
      c.fillText(SMUFL[item.glyph], 0, 0);
      if (opts.selected) outline(c, b.left * px, b.top * px, (b.right - b.left) * px, (b.bottom - b.top) * px);
    },
    hitFunc: (ctx, shape) => {
      const pad = 6;
      ctx.beginPath();
      ctx.rect(b.left * px - pad, b.top * px - pad, (b.right - b.left) * px + pad * 2, (b.bottom - b.top) * px + pad * 2);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
  });
}

/** 코드 네임 텍스트 노드. #, b 는 Bravura 임시표로 그린다. */
export function textNode(item: TextItem, W: number, opts: { draggable: boolean; selected: boolean }) {
  const px = item.size * W;
  const { runs, width } = layoutChordText(item.text, px);
  return new Konva.Shape({
    id: item.id,
    x: item.x * W,
    y: item.y * W,
    draggable: opts.draggable,
    fill: item.color,
    perfectDrawEnabled: false,
    sceneFunc: (ctx) => {
      const c = ctx._context;
      c.textBaseline = 'alphabetic';
      c.fillStyle = item.color;
      for (const r of runs) {
        c.font = r.font;
        c.fillText(r.text, r.x, r.dy);
      }
      if (opts.selected) outline(c, 0, -0.78 * px, width, px);
    },
    hitFunc: (ctx, shape) => {
      ctx.beginPath();
      ctx.rect(-6, -0.78 * px - 6, width + 12, px + 12);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
  });
}

function outline(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.save();
  c.strokeStyle = '#e8a33a';
  c.lineWidth = 1.5;
  c.setLineDash([4, 3]);
  c.strokeRect(x - 4, y - 4, w + 8, h + 8);
  c.restore();
}

/** 지우개·선택 판정용 경계(u) */
export function symbolBox(item: SymbolItem) {
  const b = glyphBounds(item.glyph);
  return { minX: item.x + b.left * item.size, maxX: item.x + b.right * item.size, minY: item.y + b.top * item.size, maxY: item.y + b.bottom * item.size };
}

export function textBox(item: TextItem) {
  const b = textBounds(item.text, item.size);
  return { minX: item.x + b.left, maxX: item.x + b.right, minY: item.y + b.top, maxY: item.y + b.bottom };
}
