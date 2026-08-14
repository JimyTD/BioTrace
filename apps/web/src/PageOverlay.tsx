import { useLayoutEffect, useRef, type ReactNode } from "react";

let overlayCount = 0;

function pinToContent(el: HTMLElement) {
  const main = document.querySelector("main.content");
  const r = (main ?? el).getBoundingClientRect();
  el.style.position = "fixed";
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

export default function PageOverlay({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const main = document.querySelector("main.content");
    if (!el) return;
    pinToContent(el);
    overlayCount += 1;
    main?.classList.add("is-overlay-open");
    const onResize = () => pinToContent(el);
    window.addEventListener("resize", onResize);
    return () => {
      overlayCount = Math.max(0, overlayCount - 1);
      if (overlayCount === 0) main?.classList.remove("is-overlay-open");
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={`page-lift-overlay${className ? ` ${className}` : ""}`} ref={ref}>
      {children}
    </div>
  );
}
