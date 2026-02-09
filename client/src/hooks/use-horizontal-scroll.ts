import { useEffect, useRef } from "react";

export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>() {
  const scrollRef = useRef<T>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY || e.deltaX, behavior: "smooth" });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        el.scrollBy({ left: -80, behavior: "smooth" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        el.scrollBy({ left: 80, behavior: "smooth" });
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return scrollRef;
}
