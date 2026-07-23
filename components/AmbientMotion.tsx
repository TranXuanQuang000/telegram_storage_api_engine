"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AmbientMotion() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;
    let routeTimer = 0;
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
    function beginNeonRoute(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      const isStoryRoute = anchor.dataset.neonTransition === "story"
        || destination.pathname.startsWith("/story/")
        || destination.pathname.startsWith("/read/");
      if (!isStoryRoute || destination.origin !== window.location.origin || destination.href === window.location.href) return;

      event.preventDefault();
      if (root.dataset.routeTransition === "opening") return;

      const transitionX = event.detail === 0 ? window.innerWidth / 2 : event.clientX;
      const transitionY = event.detail === 0 ? window.innerHeight / 2 : event.clientY;
      root.style.setProperty("--transition-x", `${transitionX}px`);
      root.style.setProperty("--transition-y", `${transitionY}px`);
      anchor.closest(".story-card, .library-story-card, .hero-stage")?.setAttribute("data-transition-source", "true");
      root.dataset.routeTransition = "opening";
      routeTimer = window.setTimeout(() => {
        router.push(`${destination.pathname}${destination.search}${destination.hash}`);
      }, 520);
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("click", beginNeonRoute, true);
    updateScroll();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(routeTimer);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("click", beginNeonRoute, true);
    };
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.routeTransition !== "opening") return;

    root.dataset.routeTransition = "arriving";
    const revealTimer = window.setTimeout(() => {
      delete root.dataset.routeTransition;
      document.querySelectorAll("[data-transition-source]").forEach((element) => {
        element.removeAttribute("data-transition-source");
      });
    }, 820);
    return () => window.clearTimeout(revealTimer);
  }, [pathname]);

  return (
    <>
      <div className="ambient-motion" aria-hidden="true">
        <span />
        <span />
        <span />
        <div className="ambient-motion__scan" />
        <div className="ambient-motion__reticle"><i /><i /><i /></div>
        <div className="ambient-motion__streams">
          {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
        </div>
        <div className="ambient-motion__horizon"><i /><i /><i /><i /><i /></div>
        <div className="ambient-motion__telemetry">
          <span>SYS·MỰC/26</span>
          <span>NEURAL LINK · STABLE</span>
          <span>SCROLL VECTOR · LIVE</span>
        </div>
      </div>
      <div className="route-transition" aria-hidden="true">
        <span className="route-transition__gate" />
        <span className="route-transition__core" />
        <span className="route-transition__beam route-transition__beam--one" />
        <span className="route-transition__beam route-transition__beam--two" />
        <span className="route-transition__label">NEON GATE · STORY LINK</span>
      </div>
    </>
  );
}
