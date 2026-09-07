import { t } from "@biotrace/messages";

/**
 * 「NC · 未收录」印章：软档（影像/标本上的真生物）详情页里
 * 占据稀有度徽章位置的那枚章。与稀有度蜡章同走代码自绘 SVG
 * （SettleRaritySeal 的路子），纸灰色、无辉光——它不是档位，
 * 是「图鉴不收」的记号。
 *
 * 文案与「SSR · 非常稀有」同构（代码 · 词）；viewBox 加宽到 140，
 * 令渲染高度（宽 5.6rem 锁定）压回稀有度徽章那一档。
 *
 * 色**故意不做成 token**：这枚章的材质跟稀有度章一样属于自己，
 * 皮肤要换物件走 themes/slots.ts 的槽位整枚换。
 */
export default function SoftEncounterSeal() {
  return (
    <span className="soft-seal" title={t("detail.softSeal")}>
      <svg className="soft-seal-svg" viewBox="0 0 140 44" aria-hidden>
        <rect
          x="1.5"
          y="1.5"
          width="137"
          height="41"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text
          x="70"
          y="28.5"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          letterSpacing="2"
          fill="currentColor"
        >
          {t("detail.softSeal")}
        </text>
      </svg>
    </span>
  );
}
