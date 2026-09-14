import type { ThemedMessageKey } from "../zh.js";

/**
 * 日光图版：只写「有据」的说法。
 *
 * 依据是品牌叙事里既定的两句——美术走 19 世纪博物图版（素版线刻 / 手工上色彩版），
 * 开包动作是拆封（牛皮纸包、封蜡、壳被抬走）。所以只保留能落在这两句上的：
 * 「拆封」那条线（启封 / 启封中… / 入册 / 入册中…），以及顺着「日光图版」这个名字的两条
 * （定名图版 / 此行所见，已录其名。）。
 *
 * 套册那 8 条（settle.volume*）已收回固定区，覆盖不了，也不覆盖。
 * 不编：文档里没有「图版册怎么入册」「用什么章」这类设定——要立也得先定叙事、再写词。
 */
export const daylightVoice: Partial<Record<ThemedMessageKey, string>> = {
  "settle.title": "定名图版",
  "settle.lede": "此行所见，已录其名。",
  "settle.open": "启封",
  "settle.opening": "启封中…",
  "settle.claim": "入册",
  "settle.claiming": "入册中…",
};
