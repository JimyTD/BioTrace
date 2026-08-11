/** Shared encounter-class rubric (calibrate + production). No species answer keys. */
export const ENCOUNTER_RUBRIC = `你在为旅行 App「BioTrace」判定给定国家尺度下野生/野外旅行遇见的「遇见类别」与修正轴。
这不是科研丰度。主信号是 encounter_class（遇见桶）；另给四个修正轴供系统做最多 ±1 档偏移。不要针对某个中文俗名背答案。

核心判别（选桶，比生态学常见度更优先）：
- 若普通人旅行中拍到会有一点「收获/想留影」的感觉 → 至少 place_common，常见情况用 noteworthy；不要因为「城乡也很多」就打成 everyday。
- everyday / pest_weed 只留给「看见了也不会当成一次收集」的东西（嫌恶、杂草、真正无感背景）。
- 难拍本身不单独决定主桶；但可在 hard_to_photograph 轴打高分。

只从下列枚举选一个 encounter_class（必填）：
- pest_weed：卫生害虫、吸血蚊蚋、路旁广布杂草等嫌恶/无感极常见。
- everyday：真正无旅行收获感的城乡背景（非上类）。判定键：拍到了也不会觉得开到一张卡。
  禁止：把「城乡常见但会想拍的野鸟/野生脊椎动物」标成 everyday（应 ≥ noteworthy，至少 place_common）。
  禁止：主要出现在潮间带/墙缝/雨夜静水/浅滩等特定微生境时标 everyday（应 ≥ place_common）。
- place_common：到对的微生境几乎必见、密度高、惊喜弱，但仍可能有轻微收集感。
- noteworthy：有明确野趣/旅行收获感，全国尺度上并不算难得。
  包括：多数野生鸟（即使公园/城区可见）、有观察乐趣的常见昆虫、水边巡飞、田塘常见两栖等。
  边界：若该类群通常隐蔽、夜行、回避人类，普通行程很难碰上 → 不要停在 noteworthy，应升到 scarce/hard。
- scarce：一次常规多日旅行里算明显好运。
- hard：多数旅行者多年难得一遇，但仍有可重复野外遇见路径。
  景区半驯化、投喂成群的大型兽 → 仍 hard，禁止因此升 legend。
- legend：接近一生一次；极难，但有现存野外种群、理论上可遇。
  禁止：广泛归化的引入爬行/水生生物标 legend（最多 noteworthy）。
  禁止：仅因「中型兽少见」就标 legend——那种通常是 hard/scarce。
- unobtainable：功能灭绝/已灭绝/对旅行者野外实质不可再遇（有现存偶见分布则用 legend，不用本档）。

修正轴（整数；与选桶分开想）：
- iconic_appeal：-2…+2
  负=嫌恶/无感背景；0=中性；正=标志性「这趟值了」的向往（萤火虫夜景、金丝猴等）。不是「可爱网红」乱加。
- protection_level：none|uncertain|you|class_ii|class_i
  没把握用 uncertain；害虫/杂草/引入种/普通无脊椎常见类用 none。
  保护级高不等于自动 legend。
- swarm_or_habituated：0–3
  成群/不躲人/景区半驯化越高越大。独行警惕打低。
- hard_to_photograph：0–3
  越难发现/难拍越高（夜行、一瞬、隐蔽）。显眼好拍打低。

禁止输出 N/R/SR 字母档。只输出 JSON：
{"encounter_class":"...","iconic_appeal":0,"protection_level":"...","swarm_or_habituated":0,"hard_to_photograph":0,"reason":"..."}`;
