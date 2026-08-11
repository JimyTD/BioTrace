import type { Rarity } from "../api";

/** 与 public/settle/*/rarity-seal*.svg 同源；做成 data-URI，避免外链 mask 在 WebView 失效出方底 */
const ROUND_SEAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<path fill="#fff" fill-rule="evenodd" d="M64 6 L70.85 11.95 L79.01 7.98 L84.09 15.5 L93 13.77 L95.96 22.35 L105.01 22.99 L105.65 32.04 L114.23 35 L112.5 43.91 L120.02 48.99 L116.05 57.15 L122 64 L116.05 70.85 L120.02 79.01 L112.5 84.09 L114.23 93 L105.65 95.96 L105.01 105.01 L95.96 105.65 L93 114.23 L84.09 112.5 L79.01 120.02 L70.85 116.05 L64 122 L57.15 116.05 L48.99 120.02 L43.91 112.5 L35 114.23 L32.04 105.65 L22.99 105.01 L22.35 95.96 L13.77 93 L15.5 84.09 L7.98 79.01 L11.95 70.85 L6 64 L11.95 57.15 L7.98 48.99 L15.5 43.91 L13.77 35 L22.35 32.04 L22.99 22.99 L32.04 22.35 L35 13.77 L43.91 15.5 L48.99 7.98 L57.15 11.95 Z M98 64 A34 34 0 1 1 30 64 A34 34 0 1 1 98 64 Z"/>
</svg>`;

const XR_SEAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<path fill="#fff" fill-rule="evenodd" d="M6 64 L9.87 32.75 L35 13.77 L64 1.5 L93 13.77 L118.13 32.75 L122 64 L118.13 95.25 L93 114.23 L64 126.5 L35 114.23 L9.87 95.25 Z M30 64 L47 34.56 L81 34.56 L98 64 L81 93.44 L47 93.44 Z"/>
</svg>`;

function maskDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

type Props = {
  rarity: Rarity;
};

export function SettleRaritySeal({ rarity }: Props) {
  const mask = maskDataUri(rarity === "XR" ? XR_SEAL_SVG : ROUND_SEAL_SVG);

  return (
    <div className={`settle-rarity-seal rarity-${rarity}`}>
      <div
        className="settle-rarity-seal-motif"
        style={{ ["--seal-mask" as string]: mask }}
        aria-hidden
      />
      <span className="settle-rarity-letter">{rarity}</span>
    </div>
  );
}
