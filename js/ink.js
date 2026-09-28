// 필기 스트로크 그리기/지우기.
// 스트로크: { tool: 'pen' | 'highlighter', color, width, points: [x, y, pressure, x, y, pressure, ...] }
// 좌표와 굵기는 페이지 크기에 대한 비율(0~1)로 저장하므로 화면 크기가 바뀌어도 그대로 맞는다.

export const PEN_COLORS = ['#111111', '#d62828', '#1d4ed8', '#15803d', '#7c3aed'];
export const HIGHLIGHTER_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#ffa8a8'];
export const PEN_SIZES = [0.0022, 0.0038, 0.006];
export const HIGHLIGHTER_SIZES = [0.012, 0.02, 0.03];
export const ERASER_SIZES = [0.012, 0.025, 0.045];

const HIGHLIGHTER_ALPHA = 0.4;

export function drawStrokes(ctx, strokes, w, h) {
  ctx.clearRect(0, 0, w, h);
  for (const s of strokes) drawStroke(ctx, s, w, h);
}

export function drawStroke(ctx, s, w, h) {
  const p = s.points;
  if (p.length < 3) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  const base = s.width * w;

  if (s.tool === 'highlighter') {
    // 한 경로로 그려야 겹친 부분이 진해지지 않는다.
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(p[0] * w, p[1] * h);
    if (p.length === 3) ctx.lineTo(p[0] * w + 0.01, p[1] * h);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * w, p[i + 1] * h);
    ctx.stroke();
  } else if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, penWidth(base, p[2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 필압에 따라 굵기가 달라지도록 중점 사이를 2차 곡선 조각으로 그린다.
    let mx = p[0] * w;
    let my = p[1] * h;
    for (let i = 3; i < p.length; i += 3) {
      const x1 = p[i] * w, y1 = p[i + 1] * h;
      const last = i + 3 >= p.length;
      const nx = last ? x1 : (x1 + p[i + 3] * w) / 2;
      const ny = last ? y1 : (y1 + p[i + 4] * h) / 2;
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

function penWidth(base, pressure) {
  return base * (0.45 + 0.9 * pressure);
}

// 지우개 원(cx, cy, r — 페이지 비율, aspect = 높이/너비)에 닿는 스트로크 인덱스.
export function hitStrokes(strokes, cx, cy, r, aspect) {
  const hits = [];
  for (let k = 0; k < strokes.length; k++) {
    const s = strokes[k];
    const p = s.points;
    const reach = r + s.width / 2;
    const r2 = reach * reach;
    for (let i = 0; i < p.length; i += 3) {
      const ax = p[i], ay = p[i + 1] * aspect;
      const bx = i + 3 < p.length ? p[i + 3] : ax;
      const by = i + 3 < p.length ? p[i + 4] * aspect : ay;
      if (segDist2(cx, cy * aspect, ax, ay, bx, by) <= r2) { hits.push(k); break; }
    }
  }
  return hits;
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}

// 저장 용량을 줄이기 위해 좌표를 반올림한다.
export function round(v) {
  return Math.round(v * 10000) / 10000;
}
