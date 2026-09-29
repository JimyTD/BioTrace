/** Dev-only copy for the trips concept. Not part of the production message catalog. */
export const draftCopy = {
  title: "旅途示意",
  samples: "示例旅途",
  live: "本地旅途",
  single: "一趟旅途",
  many: "二十趟旅途",
  empty: "空旅途页",
  long: "长标题",
  theme: "预览主题",
  data: "预览数据",
  original: "原页面",
  count: "{count} 段旅途",
  search: "搜索旅途或地点",
  noMatch: "没有匹配的旅途",
  add: "新建或加入旅途",
  close: "关闭",
  sampleCode: "示例共享码",
  jiuzhai: "九寨的山水之间",
  coast: "沿着海岸慢慢走",
  park: "周末，去公园",
  emptyTrip: "下一站，还没想好",
  longTitle: "从井冈山走到湘潭，记下沿途遇见的生命",
  sichuan: "四川 · 阿坝",
  xiamen: "福建 · 厦门",
  hangzhou: "浙江 · 杭州",
  jiangxi: "江西 · 井冈山 — 湖南 · 湘潭",
} as const;

export function draftText(
  key: keyof typeof draftCopy,
  vars?: Record<string, string | number>,
): string {
  let text: string = draftCopy[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
