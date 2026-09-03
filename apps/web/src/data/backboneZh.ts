/**
 * 骨架高阶元的中文名表。
 *
 * ── 为什么要这张表 ──────────────────────────────────────────
 * GBIF backbone 的高阶元中文俗名覆盖率是 **0%**（实测，见
 * `scripts/probe-backbone.py` 顶部结论）。连 Aves / Mammalia /
 * Passeriformes 都没有；只有 Felidae / Rosaceae 有，且是繁体。
 * 所以骨架的中文名只能自备。
 *
 * ── 为什么不全量覆盖 ────────────────────────────────────────
 * 骨架有 1914 个节点，其中目级 1513 个。工程既有原则是
 * 「若该阶元没有稳定、通行的中文译名，name_zh 必须为 null，禁止臆造中译」
 * （`apps/api/src/identify/prompt.ts:65`）。这张表遵守同一条原则：
 *
 *   · 界（5）、门（76）—— 全覆盖，都有通行中译
 *   · 纲 —— 覆盖有通行中译的；生僻类群留空
 *   · 目 —— 只收树冠三界里可拍性高的
 *
 * 没有条目的节点在界面上显示拉丁名。这不是缺陷：
 * 「你走过的地方有中文名，没走过的地方是拉丁文」本身就是一种诚实的表达，
 * 而且用户自己的收集条目自带 AI 给的中文名，不依赖这张表。
 *
 * ── 键的形式 ────────────────────────────────────────────────
 * `"<rank序号>:<拉丁名>"`，与 backbone.json 的 id 一致。
 * rank 必须参与：单型分类单元里纲与目同名（如 Diplura 双尾纲 / 双尾目）。
 *
 * ⚠ 改这张表后必须跑 `python scripts/check-zh.py` —— 它会揪出死键
 * （骨架里不存在的键）。死键永远不会命中，界面上静默显示拉丁名，
 * 靠肉眼根本发现不了。第一版就写错了 17 个。
 *
 * ── GBIF 的分类和教科书不一样，别按常识填 ───────────────────
 * 实测（scripts/probe-rank.py）：
 *   · **没有 Reptilia（爬行纲）** —— Squamata 有鳞、Testudines 龟鳖、
 *     Crocodylia 鳄、Sphenodontia 喙头 都是**纲**，直接挂在 Chordata 下
 *   · **没有 Actinopterygii（辐鳍鱼纲）** —— 鱼类的「目」（Cypriniformes
 *     鲤形目、Perciformes 鲈形目…）也直接挂在 Chordata 下，跳过了纲
 *   · 所以 Chordata 的 62 个子级里混着 class 和 order 两种 rank
 * 这就是「深度不齐」在真实数据里的样子。
 */

export const BACKBONE_ZH: Record<string, string> = {
  // ── 界 ──────────────────────────────────────────────────
  "0:Animalia": "动物界",
  "0:Plantae": "植物界",
  "0:Fungi": "真菌界",
  "0:Chromista": "色藻界",
  "0:Protozoa": "原生动物界",

  // ── 门 · 动物界（34）─────────────────────────────────────
  "1:Chordata": "脊索动物门",
  "1:Arthropoda": "节肢动物门",
  "1:Mollusca": "软体动物门",
  "1:Annelida": "环节动物门",
  "1:Platyhelminthes": "扁形动物门",
  "1:Nematoda": "线虫动物门",
  "1:Cnidaria": "刺胞动物门",
  "1:Echinodermata": "棘皮动物门",
  "1:Porifera": "多孔动物门",
  "1:Bryozoa": "苔藓动物门",
  "1:Brachiopoda": "腕足动物门",
  "1:Nemertea": "纽形动物门",
  "1:Ctenophora": "栉水母动物门",
  "1:Tardigrada": "缓步动物门",
  "1:Rotifera": "轮形动物门",
  "1:Acanthocephala": "棘头动物门",
  "1:Priapulida": "螠虫动物门",
  "1:Sipuncula": "星虫动物门",
  "1:Hemichordata": "半索动物门",
  "1:Chaetognatha": "毛颚动物门",
  "1:Entoprocta": "内肛动物门",
  "1:Gnathostomulida": "颚胃动物门",
  "1:Kinorhyncha": "动吻动物门",
  "1:Nematomorpha": "线形动物门",
  "1:Placozoa": "扁盘动物门",
  "1:Xenacoelomorpha": "无腔动物门",
  "1:Cycliophora": "环口动物门",
  "1:Dicyemida": "二胚虫门",
  "1:Loricifera": "铠甲动物门",
  "1:Micrognathozoa": "微颚动物门",
  "1:Gastrotricha": "腹毛动物门",
  "1:Onychophora": "有爪动物门",
  "1:Orthonectida": "直泳虫门",
  "1:Phoronida": "帚虫动物门",

  // ── 门 · 植物界 ──────────────────────────────────────────
  "1:Tracheophyta": "维管植物门",
  "1:Bryophyta": "苔藓植物门",
  "1:Marchantiophyta": "地钱门",
  "1:Anthocerotophyta": "角苔门",
  "1:Rhodophyta": "红藻门",
  "1:Chlorophyta": "绿藻门",
  "1:Charophyta": "轮藻门",
  "1:Glaucophyta": "灰胞藻门",
  "1:Langiophytophyta": "莱尼蕨门",

  // ── 门 · 真菌界 ──────────────────────────────────────────
  "1:Ascomycota": "子囊菌门",
  "1:Basidiomycota": "担子菌门",
  "1:Mucoromycota": "毛霉门",
  "1:Chytridiomycota": "壶菌门",
  "1:Zygomycota": "接合菌门",
  "1:Glomeromycota": "球囊菌门",
  "1:Zoopagomycota": "捕虫霉门",
  "1:Blastocladiomycota": "芽枝霉门",
  "1:Microsporidia": "微孢子虫门",
  "1:Neocallimastigomycota": "新丽鞭毛菌门",
  "1:Entomophthoromycota": "虫霉门",
  "1:Sanchytriomycota": "桑壶菌门",

  // ── 门 · 色藻界 ──────────────────────────────────────────
  "1:Ochrophyta": "黄藻门",
  "1:Ciliophora": "纤毛虫门",
  "1:Foraminifera": "有孔虫门",
  "1:Myzozoa": "囊泡虫门",
  "1:Oomycota": "卵菌门",
  "1:Cryptophyta": "隐藻门",
  "1:Haptophyta": "定鞭藻门",
  "1:Heliozoa": "太阳虫门",
  "1:Cercozoa": "丝足虫门",
  "1:Bigyra": "双鞭毛虫门",
  "1:Picozoa": "微型藻门",
  "1:Acavomonidia": "无腔鞭毛虫门",

  // ── 门 · 原生动物界 ──────────────────────────────────────
  "1:Amoebozoa": "变形虫门",
  "1:Euglenozoa": "眼虫门",
  "1:Choanozoa": "领鞭虫门",
  "1:Metamonada": "后滴门",
  "1:Loukozoa": "沟鞭虫门",
  "1:Sarcomastigophora": "肉鞭动物门",
  "1:Sulcozoa": "沟虫门",
  "1:Mycetozoa": "黏菌门",
  "1:Calcitarcha": "钙质囊门",

  // ── 纲 · 动物界（可拍性高的）────────────────────────────
  // ⚠ GBIF 没有 Reptilia / Actinopterygii。爬行类的四个类群和鱼类的目
  //   都直接挂在 Chordata 下，见文件头说明。
  "2:Mammalia": "哺乳纲",
  "2:Aves": "鸟纲",
  "2:Amphibia": "两栖纲",
  "2:Squamata": "有鳞纲",
  "2:Testudines": "龟鳖纲",
  "2:Crocodylia": "鳄纲",
  "2:Sphenodontia": "喙头纲",
  "2:Elasmobranchii": "板鳃纲",
  "2:Holocephali": "全头纲",
  "2:Coelacanthi": "腔棘鱼纲",
  "2:Dipneusti": "肺鱼纲",
  "2:Myxini": "盲鳗纲",
  "2:Petromyzonti": "七鳃鳗纲",
  "2:Leptocardii": "头索纲",
  "2:Thaliacea": "海樽纲",
  "2:Insecta": "昆虫纲",
  "2:Arachnida": "蛛形纲",
  "2:Malacostraca": "软甲纲",
  "2:Maxillopoda": "颚足纲",
  "2:Diplopoda": "双足纲",
  "2:Chilopoda": "唇足纲",
  "2:Collembola": "弹尾纲",
  "2:Diplura": "双尾纲",
  "2:Protura": "原尾纲",
  "2:Gastropoda": "腹足纲",
  "2:Bivalvia": "双壳纲",
  "2:Cephalopoda": "头足纲",
  "2:Polyplacophora": "多板纲",
  "2:Clitellata": "环带纲",
  "2:Polychaeta": "多毛纲",
  "2:Anthozoa": "珊瑚纲",
  "2:Scyphozoa": "钵水母纲",
  "2:Hydrozoa": "水螅纲",
  "2:Asteroidea": "海星纲",
  "2:Echinoidea": "海胆纲",
  "2:Holothuroidea": "海参纲",
  "2:Ophiuroidea": "蛇尾纲",
  "2:Crinoidea": "海百合纲",
  "2:Demospongiae": "普通海绵纲",
  "2:Ascidiacea": "海鞘纲",

  // ── 纲 · 植物界 ──────────────────────────────────────────
  "2:Magnoliopsida": "木兰纲",
  "2:Liliopsida": "百合纲",
  "2:Pinopsida": "松柏纲",
  "2:Cycadopsida": "苏铁纲",
  "2:Ginkgoopsida": "银杏纲",
  "2:Gnetopsida": "买麻藤纲",
  "2:Polypodiopsida": "水龙骨纲",
  "2:Lycopodiopsida": "石松纲",
  "2:Bryopsida": "真藓纲",
  "2:Sphagnopsida": "泥炭苔纲",
  "2:Polytrichopsida": "金发藓纲",
  "2:Jungermanniopsida": "叶苔纲",
  "2:Marchantiopsida": "地钱纲",
  "2:Florideophyceae": "红藻纲",
  "2:Ulvophyceae": "石莼纲",
  "2:Chlorophyceae": "绿藻纲",
  "2:Bangiophyceae": "红毛菜纲",
  "2:Charophyceae": "轮藻纲",

  // ── 纲 · 真菌界 ──────────────────────────────────────────
  "2:Agaricomycetes": "伞菌纲",
  "2:Sordariomycetes": "肉座菌纲",
  "2:Dothideomycetes": "座囊菌纲",
  "2:Lecanoromycetes": "茶渍纲",
  "2:Eurotiomycetes": "散囊菌纲",
  "2:Leotiomycetes": "锤舌菌纲",
  "2:Pezizomycetes": "盘菌纲",
  "2:Saccharomycetes": "酵母纲",
  "2:Pucciniomycetes": "锈菌纲",
  "2:Ustilaginomycetes": "黑粉菌纲",
  "2:Tremellomycetes": "银耳纲",
  "2:Dacrymycetes": "花耳纲",
  "2:Mucoromycetes": "毛霉纲",
  "2:Chytridiomycetes": "壶菌纲",
  "2:Glomeromycetes": "球囊菌纲",
  "2:Orbiliomycetes": "圆盘菌纲",
  "2:Taphrinomycetes": "外囊菌纲",

  // ── 纲 · 色藻界 ──────────────────────────────────────────
  "2:Phaeophyceae": "褐藻纲",
  "2:Bacillariophyceae": "硅藻纲",
  "2:Dinophyceae": "甲藻纲",
  "2:Xanthophyceae": "黄绿藻纲",
  "2:Chrysophyceae": "金藻纲",
  "2:Oligohymenophorea": "寡膜纲",
  "2:Spirotrichea": "旋毛纲",
  "2:Litostomatea": "裸口纲",
  "2:Raphidophyceae": "针胞藻纲",
  "2:Eustigmatophyceae": "真眼点藻纲",

  // ── 纲 · 原生动物界 ──────────────────────────────────────
  "2:Tubulinea": "管足纲",
  "2:Discosea": "盘变形虫纲",
  "2:Euglenoidea": "眼虫纲",
  "2:Kinetoplastea": "动基体纲",
  "2:Choanoflagellatea": "领鞭虫纲",

  // ── 目 · 树冠三界里可拍性最高的 ─────────────────────────
  "3:Carnivora": "食肉目",
  "3:Artiodactyla": "偶蹄目",
  "3:Perissodactyla": "奇蹄目",
  "3:Primates": "灵长目",
  "3:Rodentia": "啮齿目",
  "3:Lagomorpha": "兔形目",
  "3:Chiroptera": "翼手目",
  "3:Cetacea": "鲸目",
  "3:Proboscidea": "长鼻目",
  "3:Soricomorpha": "鼩形目",
  "3:Erinaceomorpha": "猬形目",
  "3:Didelphimorphia": "负鼠目",
  "3:Diprotodontia": "双门齿目",
  "3:Passeriformes": "雀形目",
  "3:Accipitriformes": "鹰形目",
  "3:Falconiformes": "隼形目",
  "3:Strigiformes": "鸮形目",
  "3:Anseriformes": "雁形目",
  "3:Galliformes": "鸡形目",
  "3:Charadriiformes": "鸻形目",
  "3:Pelecaniformes": "鹈形目",
  "3:Ciconiiformes": "鹳形目",
  "3:Gruiformes": "鹤形目",
  "3:Columbiformes": "鸽形目",
  "3:Apodiformes": "雨燕目",
  "3:Piciformes": "䴕形目",
  "3:Coraciiformes": "佛法僧目",
  "3:Cuculiformes": "鹃形目",
  "3:Psittaciformes": "鹦形目",
  "3:Podicipediformes": "䴙䴘目",
  "3:Suliformes": "鹲形目",
  // 爬行类：GBIF 里 Squamata / Testudines / Crocodylia 是**纲**不是目，
  // 已在上面 rank 2 处登记，此处不再重复。
  "3:Anura": "无尾目",
  "3:Caudata": "有尾目",
  // 鱼类：GBIF 里这些目直接挂在 Chordata 下（没有 Actinopterygii 纲）
  "3:Perciformes": "鲈形目",
  "3:Cypriniformes": "鲤形目",
  "3:Siluriformes": "鲇形目",
  "3:Salmoniformes": "鲑形目",
  "3:Clupeiformes": "鲱形目",
  "3:Anguilliformes": "鳗鲡目",
  "3:Pleuronectiformes": "鲽形目",
  "3:Scorpaeniformes": "鲉形目",
  "3:Tetraodontiformes": "鲀形目",
  "3:Syngnathiformes": "海龙目",
  "3:Gadiformes": "鳕形目",
  "3:Beloniformes": "颌针鱼目",
  "3:Cyprinodontiformes": "鲤齿目",
  "3:Mugiliformes": "鲻形目",
  "3:Acipenseriformes": "鲟形目",
  "3:Lophiiformes": "鮟鱇目",
  "3:Gobiesociformes": "喉盘鱼目",
  "3:Osteoglossiformes": "骨舌鱼目",
  "3:Characiformes": "脂鲤目",
  "3:Lepidoptera": "鳞翅目",
  "3:Coleoptera": "鞘翅目",
  "3:Hymenoptera": "膜翅目",
  "3:Diptera": "双翅目",
  "3:Hemiptera": "半翅目",
  "3:Odonata": "蜻蜓目",
  "3:Orthoptera": "直翅目",
  "3:Mantodea": "螳螂目",
  "3:Blattodea": "蜚蠊目",
  "3:Phasmida": "䗛目",
  "3:Neuroptera": "脉翅目",
  "3:Dermaptera": "革翅目",
  "3:Trichoptera": "毛翅目",
  "3:Ephemeroptera": "蜉蝣目",
  "3:Araneae": "蜘蛛目",
  "3:Scorpiones": "蝎目",
  "3:Decapoda": "十足目",
  "3:Rosales": "蔷薇目",
  "3:Asterales": "菊目",
  "3:Fabales": "豆目",
  "3:Poales": "禾本目",
  "3:Asparagales": "天门冬目",
  "3:Lamiales": "唇形目",
  "3:Fagales": "壳斗目",
  "3:Malpighiales": "金虎尾目",
  "3:Gentianales": "龙胆目",
  "3:Ranunculales": "毛茛目",
  "3:Caryophyllales": "石竹目",
  "3:Sapindales": "无患子目",
  "3:Myrtales": "桃金娘目",
  "3:Ericales": "杜鹃花目",
  "3:Apiales": "伞形目",
  "3:Brassicales": "十字花目",
  "3:Malvales": "锦葵目",
  "3:Solanales": "茄目",
  "3:Magnoliales": "木兰目",
  "3:Liliales": "百合目",
  "3:Arecales": "棕榈目",
  "3:Zingiberales": "姜目",
  "3:Pinales": "松目",
  "3:Agaricales": "伞菌目",
  "3:Polyporales": "多孔菌目",
  "3:Boletales": "牛肝菌目",
  "3:Russulales": "红菇目",
  "3:Pezizales": "盘菌目",
  "3:Xylariales": "炭角菌目",
  "3:Hypocreales": "肉座菌目",
  "3:Auriculariales": "木耳目",
  "3:Tremellales": "银耳目",
  "3:Phallales": "鬼笔目",
  "3:Hymenochaetales": "刺革菌目",
  "3:Cantharellales": "鸡油菌目",
  "3:Lecanorales": "茶渍目",
  "3:Laminariales": "海带目",
  "3:Fucales": "墨角藻目",
  "3:Ectocarpales": "褐毛藻目",
  "3:Dictyotales": "网地藻目",
};

/** 取骨架节点的显示名：有中文名用中文，否则退回拉丁名。 */
export function backboneLabel(id: string, latin: string): string {
  return BACKBONE_ZH[id] ?? latin;
}
