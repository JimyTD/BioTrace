import { useId } from "react";
import type { Rarity } from "../api";

/** 齿边圆章（中心挖空）。纯 SVG 填色，不用 CSS mask（真机易出方底）。 */
const ROUND_PATH =
  "M64 6 L70.85 11.95 L79.01 7.98 L84.09 15.5 L93 13.77 L95.96 22.35 L105.01 22.99 L105.65 32.04 L114.23 35 L112.5 43.91 L120.02 48.99 L116.05 57.15 L122 64 L116.05 70.85 L120.02 79.01 L112.5 84.09 L114.23 93 L105.65 95.96 L105.01 105.01 L95.96 105.65 L93 114.23 L84.09 112.5 L79.01 120.02 L70.85 116.05 L64 122 L57.15 116.05 L48.99 120.02 L43.91 112.5 L35 114.23 L32.04 105.65 L22.99 105.01 L22.35 95.96 L13.77 93 L15.5 84.09 L7.98 79.01 L11.95 70.85 L6 64 L11.95 57.15 L7.98 48.99 L15.5 43.91 L13.77 35 L22.35 32.04 L22.99 22.99 L32.04 22.35 L35 13.77 L43.91 15.5 L48.99 7.98 L57.15 11.95 Z M98 64 A34 34 0 1 1 30 64 A34 34 0 1 1 98 64 Z";

const XR_PATH =
  "M6 64 L9.87 32.75 L35 13.77 L64 1.5 L93 13.77 L118.13 32.75 L122 64 L118.13 95.25 L93 114.23 L64 126.5 L35 114.23 L9.87 95.25 Z M30 64 L47 34.56 L81 34.56 L98 64 L81 93.44 L47 93.44 Z";

type Props = {
  rarity: Rarity;
};

function FillGradient({ rarity, id }: { rarity: Rarity; id: string }) {
  if (rarity === "SSR") {
    return (
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff6c8" />
        <stop offset="22%" stopColor="#ffd54a" />
        <stop offset="45%" stopColor="#f0c400" />
        <stop offset="62%" stopColor="#b87800" />
        <stop offset="80%" stopColor="#ffcc33" />
        <stop offset="100%" stopColor="#a86f00" />
      </linearGradient>
    );
  }
  if (rarity === "LR") {
    return (
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#b14ef0" />
        <stop offset="25%" stopColor="#2eb0f0" />
        <stop offset="45%" stopColor="#f0c400" />
        <stop offset="65%" stopColor="#ff1f3a" />
        <stop offset="85%" stopColor="#ff00a8" />
        <stop offset="100%" stopColor="#b14ef0" />
      </linearGradient>
    );
  }
  if (rarity === "UR") {
    return (
      <linearGradient id={id} x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" stopColor="#ff8a96" />
        <stop offset="40%" stopColor="#ff1f3a" />
        <stop offset="100%" stopColor="#b00018" />
      </linearGradient>
    );
  }
  if (rarity === "XR") {
    return (
      <linearGradient id={id} x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" stopColor="#ff9ae0" />
        <stop offset="45%" stopColor="#ff00a8" />
        <stop offset="100%" stopColor="#b00070" />
      </linearGradient>
    );
  }
  return null;
}

export function SettleRaritySeal({ rarity }: Props) {
  const uid = useId().replace(/:/g, "");
  const path = rarity === "XR" ? XR_PATH : ROUND_PATH;
  const fillId = `seal-fill-${uid}`;
  const shineId = `seal-shine-${uid}`;
  const useGrad = rarity === "SSR" || rarity === "LR" || rarity === "UR" || rarity === "XR";

  return (
    <div className={`settle-rarity-seal rarity-${rarity}`}>
      <svg className="settle-rarity-seal-svg" viewBox="0 0 128 128" aria-hidden>
        <defs>
          <FillGradient rarity={rarity} id={fillId} />
          <linearGradient id={shineId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="32%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="46%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="58%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          fill={useGrad ? `url(#${fillId})` : "currentColor"}
          fillRule="evenodd"
          d={path}
        />
        <path fill={`url(#${shineId})`} fillRule="evenodd" d={path} />
      </svg>
      <span className="settle-rarity-letter">{rarity}</span>
    </div>
  );
}
