import { describe, expect, it } from 'vitest';
import { recognize } from './recognizer';
import { SYMBOL_CLASSES, type Drawing } from './templates';

// 재현 가능한 난수
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const S = 0.009; // 칸 크기(u)

/** 템플릿을 사람이 그린 것처럼 흔든다: 회전·늘임·떨림·획 순서/방향 뒤바꿈·위치 */
function handwrite(d: Drawing, rand: () => number) {
  const rot = (rand() - 0.5) * 0.2; // ±5.7°
  const sx = 1 + (rand() - 0.5) * 0.25;
  const sy = 1 + (rand() - 0.5) * 0.25;
  const ox = 0.3 + rand() * 0.4, oy = 0.3 + rand() * 0.6;
  const c = Math.cos(rot), s = Math.sin(rot);
  let strokes = d.map((stroke) => {
    const pts = stroke.map((p) => {
      const x = p.x * sx + (rand() - 0.5) * 0.12;
      const y = p.y * sy + (rand() - 0.5) * 0.12;
      return { x: ox + (x * c - y * s) * S, y: oy + (x * s + y * c) * S };
    });
    return rand() < 0.5 ? pts.reverse() : pts;
  });
  if (rand() < 0.5) strokes = strokes.reverse();
  return strokes;
}

describe('recognize', () => {
  it('손으로 그린 기호를 90% 이상 올바르게 인식한다', () => {
    const rand = rng(42);
    let total = 0, correct = 0;
    const misses: string[] = [];
    for (const cls of SYMBOL_CLASSES) {
      for (const v of cls.variants) {
        for (let i = 0; i < 8; i++) {
          total++;
          const r = recognize(handwrite(v, rand), { staffSpace: S });
          if (r?.glyph === cls.glyph) correct++;
          else misses.push(`${cls.name} → ${r ? r.name : '없음'}`);
        }
      }
    }
    const accuracy = correct / total;
    if (accuracy < 1) console.info(`accuracy ${(accuracy * 100).toFixed(1)}%`, misses);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('오선 정보 없이도 그린 크기로 인식한다', () => {
    const rand = rng(7);
    const sharp = SYMBOL_CLASSES.find((c) => c.glyph === 'accidentalSharp')!;
    const r = recognize(handwrite(sharp.variants[0], rand));
    expect(r?.glyph).toBe('accidentalSharp');
    expect(r!.staffSpace).toBeGreaterThan(S * 0.7);
    expect(r!.staffSpace).toBeLessThan(S * 1.4);
  });

  it('칠한 머리(4분음표)와 빈 머리(2분음표)를 구분한다', () => {
    const head = (turns: number) =>
      Array.from({ length: 30 * turns + 1 }, (_, i) => {
        const a = (i / 30) * Math.PI * 2;
        const r = turns > 1 ? 1 - i / (40 * turns) : 1;
        return { x: 0.5 + Math.cos(a) * 0.66 * S * r, y: 0.5 + Math.sin(a) * 0.48 * S * r };
      });
    const stem = [{ x: 0.5 + 0.62 * S, y: 0.5 }, { x: 0.5 + 0.62 * S, y: 0.5 - 3.4 * S }];
    expect(recognize([head(2), stem], { staffSpace: S })?.glyph).toBe('noteQuarterUp');
    expect(recognize([head(1), stem], { staffSpace: S })?.glyph).toBe('noteHalfUp');
  });

  it('규칙 기반 기호: 스타카토·테누토·슬래시', () => {
    expect(recognize([[{ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.501 }]], { staffSpace: S })?.glyph).toBe('articStaccatoAbove');
    expect(recognize([[{ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.5 }]], { staffSpace: S })?.glyph).toBe('articTenutoAbove');
    expect(recognize([[{ x: 0.5, y: 0.52 }, { x: 0.51, y: 0.5 }]], { staffSpace: S })?.glyph).toBe('noteheadSlashHorizontalEnds');
  });

  it('기호가 아닌 필기는 변환하지 않는다', () => {
    // 긴 물결선(슬러 등)
    const wave = Array.from({ length: 60 }, (_, i) => ({ x: 0.2 + i * 0.004, y: 0.5 + Math.sin(i / 5) * 0.01 }));
    expect(recognize([wave], { staffSpace: S })).toBeNull();
    // 마디를 감싸는 큰 원
    const circle = Array.from({ length: 60 }, (_, i) => ({ x: 0.5 + Math.cos(i / 9) * 0.08, y: 0.5 + Math.sin(i / 9) * 0.05 }));
    expect(recognize([circle], { staffSpace: S })).toBeNull();
    // 세로 직선(줄기·마디줄)
    expect(recognize([[{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.53 }]], { staffSpace: S })).toBeNull();
  });

  it('한글 글씨처럼 무작위 획은 대부분 거부한다', () => {
    const rand = rng(3);
    let accepted = 0;
    for (let i = 0; i < 40; i++) {
      const strokes = Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
        Array.from({ length: 12 }, () => ({ x: 0.5 + rand() * 3 * S, y: 0.5 + rand() * 3 * S })),
      );
      if (recognize(strokes, { staffSpace: S })) accepted++;
    }
    expect(accepted).toBeLessThanOrEqual(8);
  });
});
