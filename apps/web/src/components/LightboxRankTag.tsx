import type { RaritySealProps } from "../themes/slots";

/**
 * 灯箱皮肤的稀有度表现：贴在灯台上的一枚打字机标签，不是封蜡章。
 *
 * 蜡章属于「拆封」那套叙事；这套里没有要封的东西，
 * 稀有度是归档时打上去的一个等级码。所以是切边矩形 + 等宽字 + 疏排。
 *
 * 底色仍走各档自己的 `--rarity-*-seal`（灯箱把它读成「灯亮到什么程度」，
 * 灰→亮蓝→亮紫→亮金→刺红→彩虹→霓虹洋红）。风格示意上只画了 R 一档、
 * 用的是柯达橙，但那样七档同色就把稀有度这个信息抹了——形制照示意，颜色留信息。
 */
export function LightboxRankTag({ rarity }: RaritySealProps) {
  return (
    <span className={`lamp-rank rarity-${rarity}`} aria-hidden>
      {rarity}
    </span>
  );
}
