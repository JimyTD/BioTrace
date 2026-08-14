import { useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "@biotrace/messages";
import {
  easeOutCubic,
  lerp,
  measureBox,
  prefersReducedMotion,
  tween,
  type MotionBox,
} from "../motion";
import { volumeStampFrameUrl } from "../themes";

export type StampLift = {
  observationId: string;
  photoUrl: string;
  label: string;
  source: MotionBox;
};

type Props = {
  lift: StampLift;
  onClose: () => void;
};

function heldBox(dst: MotionBox): MotionBox {
  const size = Math.min(dst.width * 0.72, 260);
  return {
    left: (dst.width - size) / 2,
    top: (dst.height - size) / 2 - 12,
    width: size,
    height: size,
  };
}

function applyBox(el: HTMLElement, box: MotionBox) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

export default function StampLiftLayer({ lift, onClose }: Props) {
  const navigate = useNavigate();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const matRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const heldRef = useRef(false);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const mat = matRef.current;
    const card = cardRef.current;
    const main = document.querySelector("main.content");
    if (!layer || !mat || !card) return;

    const dst = measureBox(main ?? layer);
    layer.style.position = "fixed";
    layer.style.left = `${dst.left}px`;
    layer.style.top = `${dst.top}px`;
    layer.style.width = `${dst.width}px`;
    layer.style.height = `${dst.height}px`;

    const from = {
      left: lift.source.left - dst.left,
      top: lift.source.top - dst.top,
      width: lift.source.width,
      height: lift.source.height,
    };
    const held = heldBox({ left: 0, top: 0, width: dst.width, height: dst.height });
    applyBox(card, from);
    mat.style.opacity = "0";

    heldRef.current = false;
    let cancelled = false;
    const isCancelled = () => cancelled;

    void (async () => {
      if (prefersReducedMotion()) {
        applyBox(card, held);
        mat.style.opacity = "0.72";
        heldRef.current = true;
        return;
      }
      await tween(
        420,
        (t) => {
          const e = easeOutCubic(t);
          applyBox(card, {
            left: lerp(from.left, held.left, e),
            top: lerp(from.top, held.top, e),
            width: lerp(from.width, held.width, e),
            height: lerp(from.height, held.height, e),
          });
          mat.style.opacity = String(e * 0.72);
        },
        isCancelled,
      );
      if (!cancelled) heldRef.current = true;
    })();

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        void putBack();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [lift]);

  async function putBack() {
    const layer = layerRef.current;
    const mat = matRef.current;
    const card = cardRef.current;
    const main = document.querySelector("main.content");
    if (!layer || !mat || !card) {
      onClose();
      return;
    }
    const dst = measureBox(main ?? layer);
    const from = {
      left: lift.source.left - dst.left,
      top: lift.source.top - dst.top,
      width: lift.source.width,
      height: lift.source.height,
    };
    const held = heldBox({ left: 0, top: 0, width: dst.width, height: dst.height });
    if (!heldRef.current) {
      onClose();
      return;
    }
    heldRef.current = false;
    if (!prefersReducedMotion()) {
      await tween(280, (t) => {
        const e = easeOutCubic(t);
        applyBox(card, {
          left: lerp(held.left, from.left, e),
          top: lerp(held.top, from.top, e),
          width: lerp(held.width, from.width, e),
          height: lerp(held.height, from.height, e),
        });
        mat.style.opacity = String((1 - e) * 0.72);
      });
    }
    onClose();
  }

  return (
    <div className="stamp-lift-layer" ref={layerRef} role="dialog" aria-modal="true">
      <button className="stamp-lift-mat" type="button" ref={matRef} onClick={() => void putBack()} />
      <button
        className="stamp-lift-card"
        type="button"
        ref={cardRef}
        aria-label={t("collection.stampToRecord")}
        onClick={() => navigate(`/observations/${lift.observationId}`)}
      >
        <div className="stamp-face is-lit">
          <div className="stamp-photo">
            <img src={lift.photoUrl} alt={lift.label} />
          </div>
          <img className="stamp-frame" src={volumeStampFrameUrl()} alt="" aria-hidden />
        </div>
        <span className="stamp-caption">{lift.label}</span>
      </button>
    </div>
  );
}
