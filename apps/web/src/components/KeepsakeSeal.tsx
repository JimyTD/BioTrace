import { t } from "@biotrace/messages";

/**
 * 「留影」印章：留影档（没生物 / 生物仅背景 / 分不清 / 人 / 器物）详情页里
 * 占据稀有度徽章位置的那枚章。与 SoftEncounterSeal 同走代码自绘 SVG，
 * 纸灰、无辉光——它不是档位，是「图鉴不收、照片留下」的记号。
 *
 * 与软档章（NC · 未收录）的区别只在字与语义：软档是「认出来了但不算相遇」，
 * 留影是「压根不是收集品，但照片照样留住」。样式复用 .soft-seal，
 * 避免新增一套材质；皮肤要换物件走 themes/slots.ts 的槽位整枚换。
 */
export default function KeepsakeSeal() {
  return (
    <span className="soft-seal" title={t("detail.keepsakeSeal")}>
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
          {t("detail.keepsakeSeal")}
        </text>
      </svg>
    </span>
  );
}
