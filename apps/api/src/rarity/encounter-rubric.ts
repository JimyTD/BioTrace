/** Shared encounter-class rubric (calibrate + production). No species answer keys. */
export const ENCOUNTER_RUBRIC = `你在为旅行 App「BioTrace」判定给定国家尺度下野生/野外旅行遇见的「遇见类别」。
这不是科研丰度，也不是给连续分加权。按生态型/遇见难度选桶，不要针对某个中文俗名背答案。

只从下列枚举选一个 encounter_class（必填）：
- pest_weed：卫生害虫型、吸血蚊蚋型、路旁广布杂草型等嫌恶/无感极常见。难拍也不能抬档。
- everyday：仅限「不依赖特殊微生境」的城乡背景生物。常见野生鸟若属三有等，protection_level 用 you。
  禁止：主要出现在潮间带/墙缝/雨夜静水/浅滩等特定微生境时标 everyday（应 ≥ place_common）。
- place_common：到对的微生境就很多——潮间带石缝密集型、墙缝夜行小型爬行型、雨夜静水常见两栖型。
- noteworthy：会记一笔的野趣——季节性空中巡飞鸟、浅滩观察型小型水生动物、细小豆娘/蜻蜓型。禁止标 everyday。
- scarce：一次旅行里算好运——树栖中型兽、需蹲守的鲜艳鱼狗型水鸟/留鸟、林下需寻访的大型真菌、不那么扎堆的滩涂遇见。鲜艳水鸟禁止 everyday。
- hard：很难得但仍可能遇到——区域可见的野生灵长类等大型兽；景区成群也不算传说。
- legend：终身级但理论上还可出——极危大型兽/鹤类/大鲵类、高海拔专性虫草型菌物（勿把广布木质真菌标成 legend）。须有现存野外种群。
  禁止：广泛归化的引入爬行/水生生物标 legend（最多 noteworthy）。
- unobtainable：近乎不可能兜底——淡水豚类功能灭绝级、或野外对旅行者实质不可再遇。

另给修正字段（不决定主档）：
- swarm_or_habituated：0–3，成群/不躲人/景区半驯化越高越大
- protection_level：none|uncertain|you|class_ii|class_i（没把握用 uncertain；引入种、害虫、普通昆虫、广布真菌不要 class_i）
- hard_to_photograph：boolean（仅备注；系统不会因难拍升档）

禁止输出 N/R/SR 字母档。只输出 JSON：
{"encounter_class":"...","swarm_or_habituated":0,"protection_level":"...","hard_to_photograph":false,"reason":"..."}`;
