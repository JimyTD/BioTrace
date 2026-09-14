import type { ThemedMessageKey } from "../zh.js";

/**
 * 清透（默认皮肤）：沿用改造前的老文案。
 *
 * 常规版把这些说法从基础表收走后（基础表现在说「识别结果 / 看看是什么 / 揭晓中… / 收进图鉴」），
 * 清透把它们当作自己的说法留着。四条里只有 opening 是真动过的：老文案「请稍候…」是全表唯一一个
 * 客套式加载态（其余都是「动作 + 中…」），而开包的第二拍在代码里就叫「显影」，故改「正在显影…」。
 *
 * settle.title 不覆盖：老文案「鉴定证书」里的「鉴定」随 f7ea283「剥离专家人格、鉴定改识别」作废，
 * 去掉之后剩下的「证书」没有别的词能配（两次试写都在造词），故清透也用基础表的「识别结果」——
 * 仪式感由本表的 open / opening / claim 与 lede 承担。
 *
 * settle.claiming 不覆盖：清透的老文案本来就是「收下 / 收录中…」这一对，基础表照旧。
 */
export const clearVoice: Partial<Record<ThemedMessageKey, string>> = {
  "settle.lede": "这趟遇见的生命，现在有名字了。",
  "settle.open": "请过目",
  "settle.opening": "正在显影…",
  "settle.claim": "收下",
};
