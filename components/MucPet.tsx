"use client";

import { usePathname } from "next/navigation";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };
type Mood = "idle" | "petting";

const STORAGE_KEY = "muc:pixel-pet-v2";
const WIDTH = 88;
const HEIGHT = 74;

function clamp(position: Position): Position {
  if (typeof window === "undefined") return position;
  const mobileDock = window.matchMedia("(max-width: 47.99rem)").matches ? 88 : 16;
  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, window.innerWidth - WIDTH - 8)),
    y: Math.min(Math.max(90, position.y), Math.max(90, window.innerHeight - HEIGHT - mobileDock)),
  };
}

export function MucPet() {
  const pathname = usePathname();
  const reader = pathname.startsWith("/read/") || pathname.startsWith("/novels/read/");
  const positionRef = useRef<Position>({ x: 20, y: 180 });
  const dragRef = useRef({ active: false, moved: false, pointerId: -1, dx: 0, dy: 0 });
  const moodTimer = useRef(0);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 180 });
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [mood, setMood] = useState<Mood>("idle");
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState(false);

  function move(next: Position) {
    positionRef.current = next;
    setPosition(next);
  }

  function persist(nextHidden = hidden) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        hidden: nextHidden,
        x: positionRef.current.x / Math.max(1, window.innerWidth),
        y: positionRef.current.y / Math.max(1, window.innerHeight),
      }));
    } catch {
      // The pet remains optional when storage is unavailable.
    }
  }

  useEffect(() => {
    if (reader) return;
    let initial = { x: 20, y: window.innerHeight * .62 };
    let initialHidden = false;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as { x?: number; y?: number; hidden?: boolean };
      if (typeof stored.x === "number" && typeof stored.y === "number") {
        initial = { x: stored.x * window.innerWidth, y: stored.y * window.innerHeight };
      }
      initialHidden = stored.hidden === true;
    } catch {
      // Use the default spawn point.
    }
    const frame = requestAnimationFrame(() => {
      move(clamp(initial));
      setHidden(initialHidden);
      setReady(true);
    });
    const onResize = () => move(clamp(positionRef.current));
    addEventListener("resize", onResize, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", onResize);
      clearTimeout(moodTimer.current);
    };
  }, [reader]);

  useEffect(() => {
    if (!ready || reader || hidden || dragging || menu) return;
    const lowPower = matchMedia("(prefers-reduced-motion: reduce)").matches
      || matchMedia("(pointer: coarse)").matches
      || (navigator.hardwareConcurrency ?? 8) <= 4
      || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (lowPower) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          const next = clamp({
            x: 12 + Math.random() * Math.max(12, innerWidth - WIDTH - 24),
            y: 100 + Math.random() * Math.max(24, innerHeight - HEIGHT - 132),
          });
          setFacing(next.x >= positionRef.current.x ? 1 : -1);
          setMoving(true);
          move(next);
        }
        schedule();
      }, 8_000 + Math.random() * 5_000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [dragging, hidden, menu, reader, ready]);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      dx: event.clientX - positionRef.current.x,
      dy: event.clientY - positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setMoving(false);
  }

  function drag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = dragRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    const next = clamp({ x: event.clientX - state.dx, y: event.clientY - state.dy });
    if (Math.abs(next.x - positionRef.current.x) + Math.abs(next.y - positionRef.current.y) > 3) {
      state.moved = true;
      setFacing(next.x >= positionRef.current.x ? 1 : -1);
      move(next);
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    persist();
  }

  function interact() {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    setMood("petting");
    setMenu((value) => !value);
    clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setMood("idle"), 1_500);
  }

  if (reader || !ready) return null;
  if (hidden) return <button className="muc-pet-summon" type="button" onClick={() => { setHidden(false); persist(false); }}><span>Gọi Mực</span></button>;

  return (
    <div
      className={`muc-pet ${moving ? "is-moving" : ""} ${dragging ? "is-dragging" : ""} is-${mood}`}
      style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }}
      onTransitionEnd={() => setMoving(false)}
    >
      {menu ? <section className="muc-pet__panel"><header><strong>MỰC.BOT</strong><span>PIXEL COMPANION</span></header><p>Mực đang ở đây. Kéo mình đi hoặc cho nghỉ để tiết kiệm pin nhé.</p><div><button type="button" onClick={() => setMood("petting")}>Vuốt ve</button><button type="button" onClick={() => { setHidden(true); setMenu(false); persist(true); }}>Ẩn pet</button></div></section> : null}
      <button className="muc-pet__hitbox" type="button" aria-label="Mực pixel, bấm để tương tác hoặc kéo để di chuyển" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={interact}>
        <span className="muc-pet__turn" style={{ transform: `scaleX(${facing})` }}><span className="muc-pet__sprite-anim" /></span>
        <span className="muc-pet__ground" />
      </button>
    </div>
  );
}
