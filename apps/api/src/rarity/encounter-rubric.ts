/** Shared encounter-class rubric (calibrate + production). No species answer keys. */
export const ENCOUNTER_RUBRIC = `你在为旅行 App「BioTrace」判定给定国家尺度下野生/野外旅行遇见的「遇见类别」。
这不是科研丰度，也不是给连续分加权。按「旅行抽卡收获感 / 遇见难度」选桶，不要针对某个中文俗名背答案。

核心判别（比生态学常见度更优先）：
- 若普通人旅行中拍到会有一点「收获/想留影」的感觉 → 至少 place_common，常见情况用 noteworthy；不要因为「城乡也很多」就打成 everyday。
- everyday / pest_weed 只留给「看见了也不会当成一次收集」的东西（嫌恶、杂草、真正无感背景）。
- 难拍本身不决定档位；但「愿意停下来拍」往往说明已有收获感 → 倾向 noteworthy，而不是 everyday。

只从下列枚举选一个 encounter_class（必填）：
- pest_weed：卫生害虫、吸血蚊蚋、路旁广布杂草等嫌恶/无感极常见。难拍也不能抬档。
- everyday：真正无旅行收获感的城乡背景（非上类）。判定键：拍到了也不会觉得开到一张卡。
  禁止：把「城乡常见但会想拍的野鸟/野生脊椎动物」标成 everyday（应 ≥ noteworthy，至少 place_common）。
  禁止：主要出现在潮间带/墙缝/雨夜静水/浅滩等特定微生境时标 everyday（应 ≥ place_common）。
- place_common：到对的微生境几乎必见、密度高、惊喜弱，但仍可能有轻微收集感（固着潮间带、潮湿角落常见无脊椎等）。
- noteworthy：有明确野趣/旅行收获感，全国尺度上并不算难得。
  包括：多数野生鸟（即使公园/城区可见）、有观察乐趣的常见昆虫、水边巡飞、田塘常见两栖等「会想拍一下」的遇见。
  边界：若该类群通常隐蔽、夜行、回避人类，普通行程很难碰上 → 不要停在 noteworthy，应升到 scarce/hard。
- scarce：一次常规多日旅行里算明显好运。
  判定键：多数同类行程遇不到；要运气或专门留意才可能碰上（含鲜艳需蹲守的鸟、多数中型野生兽的偶遇）。
  「分布区不小 / 不是国家一级」不能挡下 scarce——旅行好不好遇见优先。
- hard：多数旅行者多年难得一遇，但仍有可重复野外遇见路径。
  判定键：夜行、警惕、密度低或依赖偏远生境的中大型野生兽，即便保护级不是最高，也可 hard。
  景区半驯化、投喂成群的大型兽 → 仍 hard，禁止因此升 legend。
- legend：接近一生一次；极难，但有现存野外种群、理论上可遇。
  禁止：广泛归化的引入爬行/水生生物标 legend（最多 noteworthy）。
  禁止：仅因「中型兽少见」就标 legend——那种通常是 hard/scarce。
- unobtainable：功能灭绝/已灭绝/对旅行者野外实质不可再遇（有现存偶见分布则用 legend，不用本档）。

另给修正字段（不决定主档）：
- swarm_or_habituated：0–3，成群/不躲人/景区半驯化越高越大
- protection_level：none|uncertain|you|class_ii|class_i
  没把握用 uncertain；害虫/杂草/引入种/普通无脊椎常见类不要 class_i/ii。
  保护级高不等于自动 legend；class 仍按收获感/遇见难度选。
- hard_to_photograph：boolean（仅备注；系统不因难拍升档）

禁止输出 N/R/SR 字母档。只输出 JSON：
{"encounter_class":"...","swarm_or_habituated":0,"protection_level":"...","hard_to_photograph":false,"reason":"..."}`;
