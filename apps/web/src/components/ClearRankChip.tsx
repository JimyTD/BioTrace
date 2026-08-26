import type { RaritySealProps } from "../themes/slots";

/**
 * 清透皮肤的稀有度表现：一枚淡彩药丸，不是封蜡章。
 *
 * 蜡章属于「拆封」那套叙事，金属渐变在这套浅底上也太吵。
 * 这儿走各档自己的浅底 / 深字（`--rarity-*-bg` / `--rarity-*-fg`），
 * 和设置行图标块、当前页签是同一种做法：淡彩只做小面积。
 */
export function ClearRankChip({ rarity }: RaritySealProps) {
  return (
    <span className={`reveal-rank rarity-${rarity}`} aria-hidden>
      {rarity}
    </span>
  );
}
