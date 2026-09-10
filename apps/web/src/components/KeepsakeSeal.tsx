import { t } from "@biotrace/messages";

/**
 * 「普通照片」印章：留影档（没生物 / 生物仅背景 / 分不清 / 人 / 器物）
 * 详情页与相册片框里的那枚章。与 SoftEncounterSeal 同走代码自绘 SVG，
 * 纸灰、无辉光——它不是档位，是「图鉴不收、照片留下」的记号。
 *
 * 2026-09-10：软档/留影的**徽章**已删，只留印章——两者原是同一信息说两遍，
 * 且印章是 AI 自加、用户未要求过。文案同步去内部状态词：「留影」→「普通照片」。
 *
 * 与软档章（非实拍生物）的区别只在字与语义：软档是「认出来了但不是实拍」，
 * 这张是「压根没生物，就是一张普通照片」。样式复用 .soft-seal，
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
