/**
 * 设置行左边那枚淡彩图标块。
 *
 * 节点常驻 DOM（照 docs/features/皮肤主题.md §2.3 的「零件常在」），
 * 摆不摆得出来由皮肤决定：`styles.css` 里默认 `display: none`，
 * 清透在 `[data-theme="clear"]` 下打开。日光那一版不显示，逐像素不变。
 *
 * 底色走 `--tint-{1..4}-bg/-ink`，两套皮肤都填了值。
 */
export type MeRowIconName = "security" | "identify" | "appearance" | "help" | "about";

/** 图标 → 用第几号淡彩。同一枚图标在哪个页面都是同一色。 */
const TINT: Record<MeRowIconName, 1 | 2 | 3 | 4> = {
  security: 1,
  identify: 2,
  appearance: 3,
  help: 4,
  about: 1,
};

function Glyph({ name }: { name: MeRowIconName }) {
  switch (name) {
    case "security":
      return <path d="M12 3.2l7 3v5.9c0 4-2.9 7.2-7 8.9-4.1-1.7-7-4.9-7-8.9V6.2l7-3z" />;
    case "identify":
      return (
        <>
          <path d="M4 7.5h16M4 12h16M4 16.5h16" />
          <circle cx="9" cy="7.5" r="2.1" fill="var(--card, #fff)" />
          <circle cx="15" cy="12" r="2.1" fill="var(--card, #fff)" />
          <circle cx="8" cy="16.5" r="2.1" fill="var(--card, #fff)" />
        </>
      );
    case "appearance":
      return (
        <>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 3.8a8.2 8.2 0 000 16.4z" fill="currentColor" stroke="none" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M9.7 9.6a2.4 2.4 0 113.8 2c-.85.6-1.5 1.05-1.5 2.1" />
          <path d="M12 17.1v.01" />
        </>
      );
    case "about":
      return (
        <>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 11.1v5.1M12 8.1v.01" />
        </>
      );
  }
}

export function MeRowIcon({ name }: { name: MeRowIconName }) {
  const tint = TINT[name];
  return (
    <span className={`me-row-icon tint-${tint}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <Glyph name={name} />
      </svg>
    </span>
  );
}
