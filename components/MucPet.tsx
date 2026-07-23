"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type PetPosition = { x: number; y: number };
type PetMood = "idle" | "happy" | "snack" | "sleepy";

const PET_STORAGE_KEY = "muc:pixel-pet";
const PET_WIDTH = 88;
const PET_HEIGHT = 76;

function clampPosition(position: PetPosition, quiet: boolean): PetPosition {
  if (typeof window === "undefined") return position;
  const topSafe = quiet ? 86 : 92;
  const bottomSafe = quiet ? 88 : window.matchMedia("(max-width: 47.99rem)").matches ? 92 : 20;
  return {
    x: Math.min(Math.max(position.x, 8), Math.max(8, window.innerWidth - PET_WIDTH - 8)),
    y: Math.min(Math.max(position.y, topSafe), Math.max(topSafe, window.innerHeight - PET_HEIGHT - bottomSafe)),
  };
}

export function MucPet() {
  const pathname = usePathname();
  const quiet = pathname.startsWith("/read/");
  const rootRef = useRef<HTMLDivElement>(null);
  const speechTimer = useRef<number>(0);
  const dragRef = useRef({ active: false, moved: false, pointerId: -1, offsetX: 0, offsetY: 0 });
  const positionRef = useRef<PetPosition>({ x: 18, y: 120 });
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<PetPosition>({ x: 18, y: 120 });
  const [facing, setFacing] = useState<1 | -1>(1);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mood, setMood] = useState<PetMood>("idle");
  const [speech, setSpeech] = useState("Kéo mình đi bất cứ đâu nhé!");
  const [burst, setBurst] = useState(0);

  const updatePosition = useCallback((next: PetPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const say = useCallback((message: string, nextMood: PetMood = "happy", duration = 2300) => {
    window.clearTimeout(speechTimer.current);
    setSpeech(message);
    setMood(nextMood);
    setBurst((value) => value + 1);
    speechTimer.current = window.setTimeout(() => {
      setMood("idle");
      setSpeech("Kéo mình đi bất cứ đâu nhé!");
    }, duration);
  }, []);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(motionQuery.matches);
    syncMotion();
    motionQuery.addEventListener("change", syncMotion);

    let savedHidden = false;
    let savedPosition: PetPosition | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(PET_STORAGE_KEY) ?? "{}") as {
        hidden?: boolean;
        xRatio?: number;
        yRatio?: number;
      };
      savedHidden = saved.hidden === true;
      if (typeof saved.xRatio === "number" && typeof saved.yRatio === "number") {
        savedPosition = {
          x: saved.xRatio * window.innerWidth,
          y: saved.yRatio * window.innerHeight,
        };
      }
    } catch {
      // The pet still works when storage is unavailable.
    }

    const initial = quiet
      ? { x: window.innerWidth - PET_WIDTH - 10, y: window.innerHeight * .5 }
      : savedPosition ?? { x: Math.min(42, window.innerWidth - PET_WIDTH - 8), y: window.innerHeight * .64 };
    const initFrame = window.requestAnimationFrame(() => {
      updatePosition(clampPosition(initial, quiet));
      setHidden(savedHidden);
      setReady(true);
    });
    return () => {
      window.cancelAnimationFrame(initFrame);
      motionQuery.removeEventListener("change", syncMotion);
      window.clearTimeout(speechTimer.current);
    };
  }, [quiet, updatePosition]);

  useEffect(() => {
    if (!ready) return;
    function onResize() {
      updatePosition(clampPosition(positionRef.current, quiet));
    }
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [quiet, ready, updatePosition]);

  useEffect(() => {
    if (!ready || hidden || quiet || reducedMotion || dragging || mood === "sleepy") return;
    let roamTimer = 0;
    function scheduleRoam() {
      roamTimer = window.setTimeout(() => {
        if (!document.hidden) {
          const next = clampPosition({
            x: 12 + Math.random() * Math.max(12, window.innerWidth - PET_WIDTH - 24),
            y: 96 + Math.random() * Math.max(24, window.innerHeight - PET_HEIGHT - 126),
          }, false);
          setFacing(next.x >= positionRef.current.x ? 1 : -1);
          setMoving(true);
          updatePosition(next);
        }
        scheduleRoam();
      }, 4200 + Math.random() * 3200);
    }
    scheduleRoam();
    return () => window.clearTimeout(roamTimer);
  }, [dragging, hidden, mood, quiet, ready, reducedMotion, updatePosition]);

  useEffect(() => {
    if (!ready || !quiet) return;
    const dockFrame = window.requestAnimationFrame(() => {
      setMenu(false);
      setMoving(false);
      setMood("idle");
      updatePosition(clampPosition({
        x: window.innerWidth - PET_WIDTH - 10,
        y: window.innerHeight * .52,
      }, true));
    });
    return () => window.cancelAnimationFrame(dockFrame);
  }, [quiet, ready, updatePosition]);

  useEffect(() => {
    function closeMenu(event: globalThis.PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenu(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function persist(nextHidden = hidden) {
    try {
      localStorage.setItem(PET_STORAGE_KEY, JSON.stringify({
        hidden: nextHidden,
        xRatio: positionRef.current.x / Math.max(1, window.innerWidth),
        yRatio: positionRef.current.y / Math.max(1, window.innerHeight),
      }));
    } catch {
      // Persistence is optional.
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const current = positionRef.current;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      offsetX: event.clientX - current.x,
      offsetY: event.clientY - current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setMoving(false);
  }

  function dragPet(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const next = clampPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }, quiet);
    if (Math.abs(next.x - positionRef.current.x) > 2 || Math.abs(next.y - positionRef.current.y) > 2) {
      drag.moved = true;
      setFacing(next.x >= positionRef.current.x ? 1 : -1);
      updatePosition(next);
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    persist();
  }

  function toggleMenu() {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    setMenu((value) => !value);
  }

  function hidePet() {
    setMenu(false);
    setHidden(true);
    persist(true);
  }

  function wakePet() {
    setHidden(false);
    persist(false);
    say("Mực đã trở lại!", "happy");
  }

  function napPet() {
    setMenu(false);
    setMood("sleepy");
    setSpeech("Zzz… gọi mình khi cần nhé.");
    window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => {
      setMood("idle");
      setSpeech("Mình tỉnh rồi!");
    }, 30_000);
  }

  if (!ready) return null;

  if (hidden) {
    return (
      <button className={`muc-pet-summon${quiet ? " is-reader" : ""}`} type="button" onClick={wakePet}>
        <Image src="/muc-pet-pixel.png" alt="" width={208} height={174} unoptimized />
        <span>Gọi Mực</span>
      </button>
    );
  }

  const menuSide = position.x < 128 ? "left" : position.x > (typeof window !== "undefined" ? window.innerWidth - 128 : 9999) ? "right" : "center";

  return (
    <div
      ref={rootRef}
      className={[
        "muc-pet",
        moving ? "is-moving" : "",
        dragging ? "is-dragging" : "",
        quiet ? "is-reader" : "",
        `is-${mood}`,
      ].filter(Boolean).join(" ")}
      data-menu-side={menuSide}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      onTransitionEnd={() => setMoving(false)}
    >
      {menu ? (
        <section className="muc-pet__panel" aria-label="Tương tác với Mực">
          <header><strong>MỰC.BOT</strong><span>{quiet ? "READER SANCTUARY" : "FREE ROAM"}</span></header>
          <p>{speech}</p>
          <div>
            <button type="button" onClick={() => say("Chào bạn! Hôm nay mình đọc gì?")}>Chào Mực</button>
            <button type="button" onClick={() => say("Ngon quá! Năng lượng +1", "snack")}>Cho snack</button>
            <button type="button" onClick={() => say("High-five! ✦", "happy")}>Đập tay</button>
            <button type="button" onClick={napPet}>Ngủ 30s</button>
            <button type="button" onClick={hidePet}>Ẩn pet</button>
          </div>
        </section>
      ) : null}

      <button
        className="muc-pet__hitbox"
        type="button"
        aria-label={quiet ? "Mực đang nghỉ ở chế độ đọc. Bấm để tương tác" : "Mực pixel. Bấm để tương tác hoặc kéo để di chuyển"}
        onPointerDown={beginDrag}
        onPointerMove={dragPet}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={toggleMenu}
      >
        <span className="muc-pet__turn" style={{ transform: `scaleX(${facing})` }}>
          <span className="muc-pet__sprite">
            <Image src="/muc-pet-pixel.png" alt="" width={208} height={174} priority unoptimized />
          </span>
        </span>
        <span className="muc-pet__ground" />
        {burst ? <span className="muc-pet__burst" key={burst}><i /><i /><i /><i /></span> : null}
      </button>
    </div>
  );
}
