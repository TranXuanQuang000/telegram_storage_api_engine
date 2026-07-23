"use client";

import { useEffect } from "react";

export function AmbientMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;
    function updatePointer(event: PointerEvent) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--pointer-x", `${event.clientX}px`);
        root.style.setProperty("--pointer-y", `${event.clientY}px`);
        root.style.setProperty("--parallax-x", `${((event.clientX / window.innerWidth) - 0.5) * 20}px`);
        root.style.setProperty("--parallax-y", `${((event.clientY / window.innerHeight) - 0.5) * 16}px`);
      });
    }
    function updateScroll() {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--scroll-progress", String(Math.min(1, window.scrollY / scrollable)));
      root.style.setProperty("--scroll-shift", `${window.scrollY % 56}px`);
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("scroll", updateScroll);
    };
  }, []);

  return (
    <div className="ambient-motion" aria-hidden="true">
      <span />
      <span />
      <span />
      <div className="ambient-motion__scan" />
      <div className="ambient-motion__reticle"><i /><i /><i /></div>
      <div className="ambient-motion__streams">
        {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
      </div>
      <div className="ambient-motion__telemetry">
        <span>SYS·MỰC/26</span>
        <span>NEURAL LINK · STABLE</span>
        <span>SCROLL VECTOR · LIVE</span>
      </div>
    </div>
  );
}
