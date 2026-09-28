import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { bboxOf, inflate, pointInBBox, roundU, strokeHit, type BBox } from '@/core/ink/geometry';
import { EMPTY_INK, type InkStroke, type InkTool, type PageInk } from '@/core/ink/types';
import { markPen } from '@/core/input/penActivity';
import { newId } from '@/lib/utils';
import {
  ERASER_RADII,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
  TEXT_SIZES,
  useInk,
  useInkSettings,
} from '@/stores/ink';
import { drawStroke, strokeNode, symbolBox, symbolNode, textBox, textNode } from './nodes';
import { groupingRadius, tryConvert } from './smartNotation';
import { TEXT_FONT } from './glyphMetrics';

interface Props {
  page: number;
  /** 페이지 전체 크기(CSS px) */
  width: number;
  height: number;
  /** 렌더링된 페이지 캔버스 — 오선 찾기에 사용 */
  raster?: HTMLCanvasElement;
}

/** 이어서 그린 획을 한 기호로 묶는 대기 시간 */
const GROUP_DELAY_MS = 650;

interface Editing { id?: string; x: number; y: number; text: string; size: number; color: string }

/**
 * 한 페이지의 필기 레이어 (Konva).
 * - content 레이어: 저장된 획·기호·텍스트 (변경 시에만 다시 그림)
 * - live 레이어: 그리는 중인 획만 매 프레임 갱신 (처음 그릴 때 만들어 메모리 절약)
 */
export function InkLayer({ page, width, height, raster }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const contentRef = useRef<Konva.Layer | null>(null);
  const liveRef = useRef<{ layer: Konva.Layer; shape: Konva.Shape } | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const propsRef = useRef({ page, width, raster });
  propsRef.current = { page, width, raster };

  const ink = useInk((s) => s.pages[page]) ?? EMPTY_INK;
  const annotating = useInk((s) => s.annotating);
  const selected = useInk((s) => (s.selected?.page === page ? s.selected.id : null));
  const tool = useInkSettings((s) => s.tool);
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // ---- Konva 스테이지 생성/정리 ----
  useLayoutEffect(() => {
    const stage = new Konva.Stage({ container: containerRef.current!, width: 1, height: 1 });
    const content = new Konva.Layer();
    const tr = new Konva.Transformer({
      rotateEnabled: false,
      keepRatio: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      borderStroke: '#e8a33a',
      anchorStroke: '#e8a33a',
      anchorSize: 14,
      ignoreStroke: true,
    });
    stage.add(content);
    content.add(tr);
    stageRef.current = stage;
    contentRef.current = content;
    trRef.current = tr;
    // 빈 곳을 누르면 선택 해제
    stage.on('pointerdown', (e) => { if (e.target === stage) useInk.getState().select(null); });
    return () => {
      stage.destroy();
      stageRef.current = contentRef.current = trRef.current = null;
      liveRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    stageRef.current?.size({ width, height });
  }, [width, height]);

  // ---- 저장된 필기 그리기 ----
  useEffect(() => {
    const content = contentRef.current, tr = trRef.current;
    if (!content || !tr || !width) return;
    const W = width;
    const selectable = annotating && tool === 'select';
    content.getChildren((n) => n !== tr).forEach((n) => n.destroy());

    for (const s of ink.strokes) content.add(strokeNode(s, W));
    for (const item of ink.symbols) {
      const node = symbolNode(item, W, { draggable: selectable, selected: false });
      wireSelectable(node, 'symbol', item.id);
      content.add(node);
    }
    for (const item of ink.texts) {
      const node = textNode(item, W, { draggable: selectable, selected: false });
      wireSelectable(node, 'text', item.id);
      content.add(node);
    }
    content.listening(selectable);
    const sel = selected ? content.findOne(`#${CSS.escape(selected)}`) : undefined;
    tr.nodes(sel ? [sel] : []);
    tr.moveToTop();
    content.batchDraw();

    function wireSelectable(node: Konva.Shape, kind: 'symbol' | 'text', id: string) {
      if (!selectable) return;
      node.on('pointerdown', () => useInk.getState().select({ page, id }));
      node.on('dragend', () => {
        const x = roundU(node.x() / W), y = roundU(node.y() / W);
        useInk.getState().commit(page, (cur) =>
          kind === 'symbol'
            ? { ...cur, symbols: cur.symbols.map((s) => (s.id === id ? { ...s, x, y } : s)) }
            : { ...cur, texts: cur.texts.map((t) => (t.id === id ? { ...t, x, y } : t)) },
        );
      });
      node.on('transformend', () => {
        const k = node.scaleX();
        node.scale({ x: 1, y: 1 });
        const x = roundU(node.x() / W), y = roundU(node.y() / W);
        useInk.getState().commit(page, (cur) =>
          kind === 'symbol'
            ? { ...cur, symbols: cur.symbols.map((s) => (s.id === id ? { ...s, x, y, size: s.size * k } : s)) }
            : { ...cur, texts: cur.texts.map((t) => (t.id === id ? { ...t, x, y, size: t.size * k } : t)) },
        );
      });
      node.on('dblclick dbltap', () => {
        if (kind !== 'text') return;
        const t = useInk.getState().pages[page]?.texts.find((x) => x.id === id);
        if (t) setEditing({ id, x: t.x, y: t.y, text: t.text, size: t.size, color: t.color });
      });
    }
  }, [ink, width, annotating, tool, selected, page]);

  // ---- 펜 입력 ----
  useEffect(() => {
    const el = containerRef.current!;
    let active: null | {
      id: number;
      tool: Exclude<InkTool, 'select'>;
      rect: DOMRect;
      stroke?: InkStroke;
      before?: PageInk;
      downAt?: { x: number; y: number };
    } = null;
    let pending: { ids: string[]; bbox: BBox; timer: ReturnType<typeof setTimeout> } | null = null;

    const flushPending = () => {
      if (!pending) return;
      const { ids } = pending;
      clearTimeout(pending.timer);
      pending = null;
      tryConvert(propsRef.current.page, ids, propsRef.current.raster);
    };

    const toU = (ev: PointerEvent, rect: DOMRect): [number, number, number] => {
      const W = rect.width || 1;
      const pressure = ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5;
      return [roundU((ev.clientX - rect.left) / W), roundU((ev.clientY - rect.top) / W), Math.round(pressure * 100) / 100];
    };

    const liveLayer = () => {
      if (!liveRef.current && stageRef.current) {
        const layer = new Konva.Layer({ listening: false });
        const shape = new Konva.Shape({
          perfectDrawEnabled: false,
          sceneFunc: (ctx) => { if (active?.stroke) drawStroke(ctx._context, active.stroke, propsRef.current.width); },
        });
        layer.add(shape);
        stageRef.current.add(layer);
        liveRef.current = { layer, shape };
      }
      return liveRef.current;
    };

    const eraseAt = (x: number, y: number) => {
      const r = ERASER_RADII[useInkSettings.getState().eraserSize];
      const c = { x, y };
      useInk.getState().mutate(propsRef.current.page, (cur) => {
        const strokes = cur.strokes.filter((s) => !strokeHit(s, c, r));
        const symbols = cur.symbols.filter((s) => !pointInBBox(c, symbolBox(s), r));
        const texts = cur.texts.filter((t) => !pointInBBox(c, textBox(t), r));
        return strokes.length === cur.strokes.length && symbols.length === cur.symbols.length && texts.length === cur.texts.length
          ? cur
          : { strokes, symbols, texts };
      });
    };

    const onDown = (e: PointerEvent) => {
      const st = useInkSettings.getState();
      const { annotating: on } = useInk.getState();
      const isPen = e.pointerType === 'pen';
      if (isPen) markPen(e.timeStamp, true);

      // 선택 도구: Konva 가 처리하고 뷰어의 페이지 넘김 제스처로는 넘기지 않는다.
      if (on && st.tool === 'select') { e.stopPropagation(); return; }

      const draws = on ? isPen || (e.pointerType === 'mouse' ? e.button === 0 : st.fingerDraw) : isPen && st.pencilAlwaysDraws;
      if (!draws || active || editingRef.current) {
        if (draws) e.stopPropagation();
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      // 필기 모드가 아닐 때 펜슬로 바로 쓰면 펜/형광펜/지우개만 쓴다.
      const t = (on ? st.tool : st.tool === 'text' || st.tool === 'select' ? 'pen' : st.tool) as Exclude<InkTool, 'select'>;
      const rect = el.getBoundingClientRect();
      const [x, y, p] = toU(e, rect);
      try { el.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      active = { id: e.pointerId, tool: t, rect };

      if (t === 'pen' || t === 'highlighter') {
        // 기호 묶음에서 멀리 떨어진 곳에 새로 쓰기 시작하면 이전 묶음을 바로 인식
        if (pending) {
          if (pointInBBox({ x, y }, inflate(pending.bbox, groupingRadius(propsRef.current.raster, pending.bbox)))) clearTimeout(pending.timer);
          else flushPending();
        }
        active.stroke = {
          id: newId(),
          tool: t,
          color: t === 'pen' ? PEN_COLORS[st.penColor] : HIGHLIGHTER_COLORS[st.highlighterColor],
          width: t === 'pen' ? PEN_WIDTHS[st.penWidth] : HIGHLIGHTER_WIDTHS[st.highlighterWidth],
          points: [x, y, p],
          t: Date.now(),
        };
        liveLayer()?.layer.batchDraw();
      } else if (t === 'eraser') {
        active.before = useInk.getState().pages[propsRef.current.page] ?? EMPTY_INK;
        eraseAt(x, y);
      } else if (t === 'text') {
        active.downAt = { x, y };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.id) return;
      if (e.pointerType === 'pen') markPen(e.timeStamp);
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e]) {
        const [x, y, p] = toU(ev, active.rect);
        if (active.stroke) {
          const pts = active.stroke.points;
          if (pts[pts.length - 3] !== x || pts[pts.length - 2] !== y) pts.push(x, y, p);
        } else if (active.tool === 'eraser') {
          eraseAt(x, y);
        }
      }
      if (active.stroke) liveRef.current?.layer.batchDraw();
    };

    const onUp = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.id) return;
      if (e.pointerType === 'pen') markPen(e.timeStamp, false);
      const a = active;
      active = null;
      const pageNo = propsRef.current.page;

      if (a.stroke) {
        const stroke = a.stroke;
        useInk.getState().commit(pageNo, (cur) => ({ ...cur, strokes: [...cur.strokes, stroke] }));
        liveRef.current?.layer.batchDraw();
        const st = useInkSettings.getState();
        if (st.smartNotation && stroke.tool === 'pen') {
          const pts = [];
          for (let i = 0; i < stroke.points.length; i += 3) pts.push({ x: stroke.points[i], y: stroke.points[i + 1] });
          const b = bboxOf(pts);
          if (pending) {
            pending.ids.push(stroke.id);
            pending.bbox = { minX: Math.min(pending.bbox.minX, b.minX), minY: Math.min(pending.bbox.minY, b.minY), maxX: Math.max(pending.bbox.maxX, b.maxX), maxY: Math.max(pending.bbox.maxY, b.maxY) };
            clearTimeout(pending.timer);
          } else {
            pending = { ids: [stroke.id], bbox: b, timer: 0 as unknown as ReturnType<typeof setTimeout> };
          }
          pending.timer = setTimeout(flushPending, GROUP_DELAY_MS);
        }
      } else if (a.tool === 'eraser' && a.before) {
        useInk.getState().recordHistory(pageNo, a.before);
      } else if (a.tool === 'text' && a.downAt) {
        const [x, y] = toU(e, a.rect);
        if (Math.hypot(x - a.downAt.x, y - a.downAt.y) < 0.01) openTextEditor(x, y);
      }
    };

    const openTextEditor = (x: number, y: number) => {
      const cur = useInk.getState().pages[propsRef.current.page] ?? EMPTY_INK;
      const hit = cur.texts.find((t) => pointInBBox({ x, y }, textBox(t), 0.004));
      const st = useInkSettings.getState();
      if (hit) setEditing({ id: hit.id, x: hit.x, y: hit.y, text: hit.text, size: hit.size, color: hit.color });
      else setEditing({ x, y: y + TEXT_SIZES[st.textSize] * 0.35, text: '', size: TEXT_SIZES[st.textSize], color: PEN_COLORS[st.penColor] });
    };

    const onCancel = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.id) return;
      if (active.tool === 'eraser' && active.before) useInk.getState().recordHistory(propsRef.current.page, active.before);
      active = null;
      markPen(e.timeStamp, false);
      liveRef.current?.layer.batchDraw();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      flushPending();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  const commitText = (value: string) => {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null);
    const text = value.trim();
    useInk.getState().commit(page, (cur) => {
      if (ed.id) {
        return { ...cur, texts: text ? cur.texts.map((t) => (t.id === ed.id ? { ...t, text } : t)) : cur.texts.filter((t) => t.id !== ed.id) };
      }
      return text ? { ...cur, texts: [...cur.texts, { id: newId(), text, x: ed.x, y: ed.y, size: ed.size, color: ed.color }] } : cur;
    });
  };

  return (
    <div
      className="absolute inset-0"
      style={{ width, height, mixBlendMode: 'multiply', touchAction: annotating ? 'none' : undefined }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {editing && (
        <input
          autoFocus
          defaultValue={editing.text}
          placeholder="C7, F#m7b5 …"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitText(e.currentTarget.value);
            if (e.key === 'Escape') setEditing(null);
          }}
          onBlur={(e) => commitText(e.currentTarget.value)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute rounded border border-amber-500 bg-white/95 px-1 text-black outline-none"
          style={{
            left: editing.x * width - 4,
            top: (editing.y - editing.size * 0.85) * width - 2,
            font: TEXT_FONT.replace('{px}', String(Math.max(14, editing.size * width))),
            width: Math.max(120, editing.size * width * 6),
          }}
        />
      )}
    </div>
  );
}
