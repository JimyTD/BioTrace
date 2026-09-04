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
 *   · 纲 / 目 —— 上手填常见类群；其余由 scripts/fill-backbone-zh.py
 *     离线配（Wikidata 主源，iNaturalist 补洞）。学名+阶元+界对不上的留空，
 *     界面显示拉丁名，排序会排到后面。
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
  // ── 离线配表开始（Wikidata 主源，iNat 补洞；不覆盖上手填）──
  // rank 2 · 纲
  "2:Agaricostilbomycetes": "伞型束梗孢菌纲",  // iNat
  "2:Allomalorhagida": "异平裂纲",  // iNat
  "2:Andreaeopsida": "黑藓纲",  // iNat
  "2:Anthocerotopsida": "角苔纲",  // iNat
  "2:Archaeorhizomycetes": "古根菌纲",  // iNat
  "2:Archiacanthocephala": "原棘头虫纲",  // iNat
  "2:Arthoniomycetes": "星裂菌纲",  // iNat
  "2:Atractiellomycetes": "小纺锤菌纲",  // iNat
  "2:Blastocladiomycetes": "芽枝霉纲",  // iNat
  "2:Bolidophyceae": "迅游藻纲",  // iNat
  "2:Branchiopoda": "鳃足纲",  // iNat
  "2:Breviatea": "短根虫纲",  // iNat
  "2:Calcarea": "钙质海绵纲",  // iNat
  "2:Caudofoveata": "尾腔纲",  // iNat
  "2:Cephalocarida": "头虾纲",  // iNat
  "2:Cestoda": "多节绦虫纲",  // iNat
  "2:Chlorokybophyceae": "绿方藻纲",  // iNat
  "2:Chromadorea": "色矛纲",  // iNat
  "2:Classiculomycetes": "舰担菌纲",  // iNat
  "2:Coleochaetophyceae": "鞘毛藻纲",  // iNat
  "2:Colpodea": "肾形虫纲",  // iNat
  "2:Compsopogonophyceae": "弯枝藻纲",  // iNat
  "2:Craniata": "髑髅贝纲",  // iNat
  "2:Cristidiscoidea": "核形虫纲",  // iNat
  "2:Cryptophyceae": "隐藻纲",  // iNat
  "2:Cubozoa": "立方水母纲",  // iNat
  "2:Cyanidiophyceae": "温泉红藻纲",  // iNat
  "2:Cyclorhagida": "圆裂纲",  // iNat
  "2:Cystobasidiomycetes": "囊担菌纲",  // iNat
  "2:Dictyochophyceae": "硅鞭藻纲",  // iNat
  "2:Dictyosteliomycetes": "网柄黏菌纲",  // iNat
  "2:Diphyllatea": "胶网虫纲",  // iNat
  "2:Diplonemea": "双丝纲",  // iNat
  "2:Ellobiopsea": "耳形虫纲",  // iNat
  "2:Endohelea": "内阳虫纲",  // iNat
  "2:Enteropneusta": "肠鳃纲",  // iNat
  "2:Entomophthoromycetes": "虫霉纲",  // iNat
  "2:Entorrhizomycetes": "根肿黑粉菌纲",  // iNat
  "2:Eoacanthocephala": "始棘头虫纲",  // iNat
  "2:Eucycliophora": "真环口纲",  // iNat
  "2:Eurotatoria": "真轮虫纲",  // iNat
  "2:Eutardigrada": "真缓步纲",  // iNat
  "2:Exobasidiomycetes": "外担菌纲",  // iNat
  "2:Glaucophyceae": "灰藻纲",  // iNat
  "2:Globothalamea": "球室纲",  // iNat
  "2:Gordioida": "铁线虫纲",  // iNat
  "2:Gymnolaemata": "裸唇纲",  // iNat
  "2:Haplomitriopsida": "裸蒴苔纲",  // iNat
  "2:Heterotardigrada": "异缓步纲",  // iNat
  "2:Heterotrichea": "异毛纲",  // iNat
  "2:Hexactinellida": "六放海绵纲",  // iNat
  "2:Homoscleromorpha": "同骨海绵纲",  // iNat
  "2:Hoplonemertea": "针纽纲",  // iNat
  "2:Ichthyosporea": "鱼孢霉纲",  // iNat
  "2:Karyorelictea": "弃核纲",  // iNat
  "2:Klebsormidiophyceae": "克里藻纲",  // iNat
  "2:Laboulbeniomycetes": "虫囊菌纲",  // iNat
  "2:Labyrinthulea": "盘蜷纲",  // iNat
  "2:Leiosporocerotopsida": "光孢角苔纲",  // iNat
  "2:Lichinomycetes": "异极衣纲",  // iNat
  "2:Lingulata": "舌形贝纲",  // iNat
  "2:Malasseziomycetes": "马拉色菌纲",  // iNat
  "2:Mamiellophyceae": "小豆藻纲",  // iNat
  "2:Merostomata": "肢口纲",  // iNat
  "2:Mesostigmatophyceae": "中斑藻纲",  // iNat
  "2:Mesotardigrada": "中缓步纲",  // iNat
  "2:Microbotryomycetes": "微球黑粉菌纲",  // iNat
  "2:Micrognathozoa": "微颚纲",  // iNat
  "2:Mixiomycetes": "混合菌纲",  // iNat
  "2:Moniliellomycetes": "丛梗孢菌纲",  // iNat
  "2:Monogenea": "单殖纲",  // iNat
  "2:Monoplacophora": "单板纲",  // iNat
  "2:Mortierellomycetes": "被孢霉纲",  // iNat
  "2:Myxomycetes": "黏菌纲",  // iNat
  "2:Myxozoa": "黏体动物纲",  // iNat
  "2:Nassophorea": "篮口纲",  // iNat
  "2:Nectonematoida": "游线虫纲",  // iNat
  "2:Neolectomycetes": "粒毛盘菌纲",  // iNat
  "2:Nephroselmidophyceae": "肾爿藻纲",  // iNat
  "2:Ostracoda": "介形虫纲",  // iNat
  "2:Palaeacanthocephala": "古棘头虫纲",  // iNat
  "2:Palaeonemertea": "古纽纲",  // iNat
  "2:Pararotatoria": "副轮虫纲",  // iNat
  "2:Pauropoda": "少足纲",  // iNat
  "2:Pavlovophyceae": "帕芙藻纲",  // iNat
  "2:Pedinophyceae": "平藻纲",  // iNat
  "2:Pelagophyceae": "远洋藻纲",  // iNat
  "2:Perkinsea": "帕金虫纲",  // iNat
  "2:Phaeothamniophyceae": "褐枝藻纲",  // iNat
  "2:Phylactolaemata": "[旧]被唇目",  // iNat
  "2:Phyllopharyngea": "叶咽纲",  // iNat
  "2:Phytomyxea": "植物寄生黏菌纲",  // iNat
  "2:Picocystophyceae": "尘囊藻纲",  // iNat
  "2:Pilidiophora": "帽形幼生纲",  // iNat
  "2:Pinguiophyceae": "脂藻纲",  // iNat
  "2:Porphyridiophyceae": "紫球藻纲",  // iNat
  "2:Prasinophyceae": "葱藻纲",  // iNat
  "2:Prostomatea": "前口纲",  // iNat
  "2:Protosteliomycetes": "原柱粘菌纲",  // iNat
  "2:Pycnogonida": "海蛛纲",  // iNat
  "2:Pyramimonadophyceae": "塔胞藻纲",  // iNat
  "2:Remipedia": "桨足纲",  // iNat
  "2:Rhodellophyceae": "红球藻纲",  // iNat
  "2:Rhombozoa": "菱形纲",  // iNat
  "2:Rhynchonellata": "小吻贝纲",  // iNat
  "2:Sagittoidea": "箭虫纲",  // iNat
  "2:Scaphopoda": "掘足纲",  // iNat
  "2:Schizocladiophyceae": "裂枝藻纲",  // iNat
  "2:Solenogastres": "沟腹纲",  // iNat
  "2:Staurozoa": "十字水母纲",  // iNat
  "2:Stenolaemata": "窄唇纲",  // iNat
  "2:Stylonematophyceae": "茎丝藻纲",  // iNat
  "2:Symphyla": "综合纲",  // iNat
  "2:Synchromophyceae": "同色藻纲",  // iNat
  "2:Syndinea": "共甲藻纲",  // iNat
  "2:Takakiopsida": "藻藓纲",  // iNat
  "2:Telonemea": "网鞭虫纲",  // iNat
  "2:Tentaculata": "触手纲",  // iNat
  "2:Trebouxiophyceae": "共球藻纲",  // iNat
  "2:Trematoda": "吸虫纲",  // iNat
  "2:Trilobita": "三叶虫纲",  // iNat
  "2:Tritirachiomycetes": "麦轴梗霉纲",  // iNat
  "2:Tubothalamea": "管室纲",  // iNat
  "2:Variosea": "杂变形虫纲",  // iNat
  "2:Wallemiomycetes": "节担菌纲",  // iNat
  "2:Xylobotryomycetes": "木簇菌纲",  // iNat
  "2:Zoopagomycetes": "捕虫霉纲",  // iNat
  "2:Zygnematophyceae": "接合藻纲",  // iNat
  // rank 3 · 目
  "3:Abrothallales": "纤柔菌目",  // iNat
  "3:Acarosporales": "微孢衣目",  // iNat
  "3:Acoela": "无肠目",  // iNat
  "3:Acorales": "菖蒲目",  // iNat
  "3:Acrochaetiales": "顶丝藻目",  // iNat
  "3:Acrospermales": "扁棒壳目",  // iNat
  "3:Acrosymphytales": "顶融藻目",  // iNat
  "3:Actiniaria": "海葵目",  // iNat
  "3:Acytosteliales": "管柄菌目",  // iNat
  "3:Adapedonta": "贫齿蛤目",  // iNat
  "3:Afrosoricida": "非洲猬目",  // iNat
  "3:Agaricostilbales": "伞型束梗孢菌目",  // iNat
  "3:Agelasida": "群海绵目",  // iNat
  "3:Agnostida": "球接子目",  // iNat
  "3:Ahnfeltiales": "伊谷藻目",  // iNat
  "3:Albuginales": "白锈菌目",  // iNat
  "3:Albuliformes": "北梭鱼目",  // iNat
  "3:Alismatales": "泽泻目",  // iNat
  "3:Allogromiida": "异量杆虫目",  // iNat
  "3:Amblypygi": "无鞭目",  // iNat
  "3:Amborellales": "无油樟目",  // iNat
  "3:Amiiformes": "弓鳍鱼目",  // iNat
  "3:Amoebida": "阿米巴目",  // iNat
  "3:Amphidiscosida": "双盘海绵目",  // iNat
  "3:Amphilepidida": "阳遂足目",  // iNat
  "3:Amphilinidea": "两线目",  // iNat
  "3:Amphinomida": "仙虫目",  // iNat
  "3:Amphipoda": "端足目",  // iNat
  "3:Amphisphaeriales": "圆孔壳目",  // iNat
  "3:Amylocorticiales": "淀粉伏革菌目",  // iNat
  "3:Anaspidacea": "山虾目",  // iNat
  "3:Andreaeales": "黑藓目",  // iNat
  "3:Andreaeobryales": "黑真藓目",  // iNat
  "3:Anostraca": "无甲目",  // iNat
  "3:Anthoathecata": "花水母目",  // iNat
  "3:Anthocerotales": "角苔目",  // iNat
  "3:Antipatharia": "黑珊瑚目",  // iNat
  "3:Aphragmophora": "无横肌目",  // iNat
  "3:Aplousobranchia": "无管海鞘目",  // iNat
  "3:Aplysiida": "无楯目",  // iNat
  "3:Apochela": "近爪目",  // iNat
  "3:Apodida": "无足目",  // iNat
  "3:Apterygiformes": "无翼目",  // iNat
  "3:Aquifoliales": "冬青目",  // iNat
  "3:Araeolaimida": "薄咽目",  // iNat
  "3:Arbacioida": "皇冠海胆目",  // iNat
  "3:Arcellinida": "表壳目",  // iNat
  "3:Archaeognatha": "石蛃目",  // iNat
  "3:Archaeosporales": "原囊霉目",  // iNat
  "3:Architaenioglossa": "古纽舌目",  // iNat
  "3:Arcida": "蚶目",  // iNat
  "3:Arctomiales": "极地衣目",  // iNat
  "3:Arguloida": "鲺目",  // iNat
  "3:Arhynchobdellida": "无吻蛭目",  // iNat
  "3:Armophorida": "瓶纤目",  // iNat
  "3:Arthoniales": "星裂菌目",  // iNat
  "3:Arthrotardigrada": "节水熊虫目",  // iNat
  "3:Asaphida": "栉虫目",  // iNat
  "3:Aspidodiadematoida": "针冠海胆目",  // iNat
  "3:Asterinales": "星盾炱目",  // iNat
  "3:Astrorhizida": "星根虫目",  // iNat
  "3:Ateleopodiformes": "辫鱼目",  // iNat
  "3:Atheliales": "无乳头菌目",  // iNat
  "3:Atheriniformes": "银汉鱼目",  // iNat
  "3:Atractiellales": "小纺锤菌目",  // iNat
  "3:Aulacomniales": "皱蒴藓目",  // iNat
  "3:Aulacoseirales": "沟链藻目",  // iNat
  "3:Aulopiformes": "仙女鱼目",  // iNat
  "3:Austrobaileyales": "木兰藤目",  // iNat
  "3:Axinellida": "小轴海绵目",  // iNat
  "3:Bacillariales": "杆状藻目",  // iNat
  "3:Baeomycetales": "羊角衣目",  // iNat
  "3:Balbianiales": "巴尔比亚藻目",  // iNat
  "3:Balliales": "巴利亚藻目",  // iNat
  "3:Bangiales": "红毛菜目",  // iNat
  "3:Bartramiales": "珠藓目",  // iNat
  "3:Basidiobolales": "蛙粪霉目",  // iNat
  "3:Bathynellacea": "地虾目",  // iNat
  "3:Bathyteuthida": "深海枪鱿目",  // iNat
  "3:Batrachoidiformes": "蟾鱼目",  // iNat
  "3:Batrachospermales": "串珠藻目",  // iNat
  "3:Berberidopsidales": "红珊藤目",  // iNat
  "3:Beroida": "瓜水母目",  // iNat
  "3:Beryciformes": "金眼鲷目",  // iNat
  "3:Biddulphiales": "盒形藻目",  // iNat
  "3:Biemnida": "边姆海绵目",  // iNat
  "3:Bivalvulida": "双壳目",  // iNat
  "3:Blasiales": "壶苞苔目",  // iNat
  "3:Blastocladiales": "芽枝霉目",  // iNat
  "3:Blastodiniales": "囊沟藻目",  // iNat
  "3:Boliniales": "团壳菌目",  // iNat
  "3:Bonnemaisoniales": "柏桉藻目",  // iNat
  "3:Boraginales": "紫草目",  // iNat
  "3:Bothrioplanida": "裂肠涡虫目",  // iNat
  "3:Botrydiales": "气球藻目",  // iNat
  "3:Botryosphaeriales": "葡萄座腔菌目",  // iNat
  "3:Brisingida": "项链海星目",  // iNat
  "3:Bruniales": "绒球花目",  // iNat
  "3:Bryales": "真藓目",  // iNat
  "3:Bryopsidales": "羽藻目",  // iNat
  "3:Bubarida": "布巴海绵目",  // iNat
  "3:Bucerotiformes": "犀鸟目",  // iNat
  "3:Bursovaginoidea": "囊道目",  // iNat
  "3:Buxales": "黄杨目",  // iNat
  "3:Buxbaumiales": "烟杆藓目",  // iNat
  "3:Calanoida": "哲水蚤目",  // iNat
  "3:Caliciales": "粉衣目",  // iNat
  "3:Callipodida": "美肢马陆目",  // iNat
  "3:Calobryales": "裸蒴苔目",  // iNat
  "3:Calosphaeriales": "美球菌目",  // iNat
  "3:Camarodonta": "拱齿目",  // iNat
  "3:Candelariales": "黄茶渍目",  // iNat
  "3:Canellales": "白樟目",  // iNat
  "3:Capnodiales": "煤炱目",  // iNat
  "3:Caprimulgiformes": "夜鹰目",  // iNat
  "3:Carcharhiniformes": "真鲨目",  // iNat
  "3:Cardiida": "鸟蛤目",  // iNat
  "3:Carditida": "心蛤目",  // iNat
  "3:Cariamiformes": "叫鹤目",  // iNat
  "3:Carybdeida": "灯水母目",  // iNat
  "3:Casuariiformes": "鹤鸵目",  // iNat
  "3:Catoscopiales": "垂蒴藓目",  // iNat
  "3:Celastrales": "卫矛目",  // iNat
  "3:Centrohelida": "中阳虫目",  // iNat
  "3:Cephalaspidea": "头楯目",  // iNat
  "3:Cephalobaenida": "头行舌虫目",  // iNat
  "3:Ceramiales": "仙菜目",  // iNat
  "3:Ceratiomyxales": "鹅绒黏菌目",  // iNat
  "3:Ceratodontiformes": "角齿鱼目",  // iNat
  "3:Ceratophyllales": "金鱼藻目",  // iNat
  "3:Cestida": "带栉水母目",  // iNat
  "3:Chaetodermatida": "毛皮贝目",  // iNat
  "3:Chaetopeltidales": "楯毛藻目",  // iNat
  "3:Chaetophorales": "胶毛藻目",  // iNat
  "3:Chaetosphaeridiales": "毛球藻目",  // iNat
  "3:Chaetothyriales": "刺盾炱目",  // iNat
  "3:Charales": "轮藻目",  // iNat
  "3:Cheilostomatida": "唇口目",  // iNat
  "3:Chimaeriformes": "银鲛目",  // iNat
  "3:Chirodropida": "箱形水母目",  // iNat
  "3:Chitonida": "石鳖目",  // iNat
  "3:Chlamydodontida": "齿管目",  // iNat
  "3:Chlamydomonadales": "衣藻目",  // iNat
  "3:Chloranthales": "金粟兰目",  // iNat
  "3:Chlorellales": "小球藻目",  // iNat
  "3:Chlorodendrales": "四爿藻目",  // iNat
  "3:Chlorokybales": "绿方藻目",  // iNat
  "3:Chondrillida": "砂皮海绵目",  // iNat
  "3:Chondrosiida": "肾海绵目",  // iNat
  "3:Chordeumatida": "泡马陆目",  // iNat
  "3:Choreotrichida": "环毛目",  // iNat
  "3:Chromadorida": "色矛目",  // iNat
  "3:Chromulinales": "色金藻目",  // iNat
  "3:Chytridiales": "壶菌目",  // iNat
  "3:Cidaroida": "头帕海胆目",  // iNat
  "3:Cingulata": "有甲目",  // iNat
  "3:Cladophorales": "刚毛藻目",  // iNat
  "3:Classiculales": "舰担菌目",  // iNat
  "3:Clathrinida": "篓海绵目",  // iNat
  "3:Clionaida": "穿贝海绵目",  // iNat
  "3:Clypeasteroida": "楯海胆目",  // iNat
  "3:Coccolithales": "球石藻目",  // iNat
  "3:Cocculinida": "科库螺目",  // iNat
  "3:Coelacanthiformes": "腔棘鱼目",  // iNat
  "3:Colaconematales": "寄丝藻目",  // iNat
  "3:Coleochaetales": "鞘毛藻目",  // iNat
  "3:Coliiformes": "鼠鸟目",  // iNat
  "3:Collemopsidiales": "滩衣目",  // iNat
  "3:Colpodida": "肾形目",  // iNat
  "3:Comatulida": "羽星目",  // iNat
  "3:Commelinales": "鸭跖草目",  // iNat
  "3:Compsopogonales": "弯枝藻目",  // iNat
  "3:Coniochaetales": "锥毛壳目",  // iNat
  "3:Coniocybales": "粉头衣目",  // iNat
  "3:Corallimorpharia": "拟珊瑚目",  // iNat
  "3:Corallinales": "珊瑚藻目",  // iNat
  "3:Cornales": "山茱萸目",  // iNat
  "3:Coronatae": "冠水母目",  // iNat
  "3:Coronophorales": "冠囊菌目",  // iNat
  "3:Corticiales": "伏革菌目",  // iNat
  "3:Corynexochida": "耸棒头虫目",  // iNat
  "3:Coscinodiscales": "圆筛藻目",  // iNat
  "3:Craniida": "髑髅贝目",  // iNat
  "3:Craterostigmomorpha": "杯蜈蚣科",  // iNat
  "3:Cribrariales": "筛菌目",  // iNat
  "3:Crossosomatales": "缨子木目",  // iNat
  "3:Cryptomonadales": "隐鞭藻目",  // iNat
  "3:Cryptomycocolacales": "隐团菌目",  // iNat
  "3:Ctenostomatida": "栉口目",  // iNat
  "3:Cucurbitales": "葫芦目",  // iNat
  "3:Cumacea": "涟虫目",  // iNat
  "3:Cyanidiales": "温泉红藻目",  // iNat
  "3:Cyatheales": "桫椤目",  // iNat
  "3:Cycadales": "苏铁目",  // iNat
  "3:Cycloneritida": "环蜑螺目",  // iNat
  "3:Cyclophyllidea": "圆叶目",  // iNat
  "3:Cyclopoida": "剑水蚤目",  // iNat
  "3:Cyclostomatida": "环口目[存疑]",  // iNat
  "3:Cydippida": "球栉水母目",  // iNat
  "3:Cymbellales": "桥弯藻目",  // iNat
  "3:Cystobasidiales": "囊担菌目",  // iNat
  "3:Cystofilobasidiales": "囊丝担菌目",  // iNat
  "3:Dacrymycetales": "花耳目",  // iNat
  "3:Dasycladales": "绒枝藻目",  // iNat
  "3:Dasyuromorphia": "袋鼬目",  // iNat
  "3:Dendroceratida": "枝角海绵目",  // iNat
  "3:Dendrocerotales": "树角苔目",  // iNat
  "3:Dendrochirotida": "枝手目",  // iNat
  "3:Dendrogastrida": "长囊虱目",  // iNat
  "3:Dentaliida": "角贝目",  // iNat
  "3:Dermoptera": "皮翼目",  // iNat
  "3:Desmacellida": "轴室海绵目",  // iNat
  "3:Desmarestiales": "酸藻目",  // iNat
  "3:Desmodorida": "链环目",  // iNat
  "3:Desmoscolecida": "带矛目",  // iNat
  "3:Diadematoida": "冠海胆目",  // iNat
  "3:Diaporthales": "间座壳目",  // iNat
  "3:Dicranales": "曲尾藓目",  // iNat
  "3:Dictyoceratida": "网角目",  // iNat
  "3:Dictyosteliales": "网柄黏菌目",  // iNat
  "3:Dilleniales": "五桠果目",  // iNat
  "3:Dimargaritales": "双珠霉目",  // iNat
  "3:Dioctophymatida": "膨结线虫目",  // iNat
  "3:Dioscoreales": "薯蓣目",  // iNat
  "3:Diphylleida": "胶网虫目",  // iNat
  "3:Diphyllobothriidea": "假叶目",  // iNat
  "3:Diphysciales": "短颈藓目",  // iNat
  "3:Diplura": "双尾目",  // iNat
  "3:Dipsacales": "川续断目",  // iNat
  "3:Diversisporales": "多孢囊霉目",  // iNat
  "3:Dixoniellales": "狄克逊藻目",  // iNat
  "3:Doassansiales": "实球黑粉菌目",  // iNat
  "3:Dolichomastigales": "长鞭藻目",  // iNat
  "3:Doliolida": "海樽目",  // iNat
  "3:Dorylaimida": "矛线目",  // iNat
  "3:Dothideales": "座囊菌目",  // iNat
  "3:Dysteriida": "偏体目",  // iNat
  "3:Eccrinida": "外毛霉目",  // iNat
  "3:Echiniscoidea": "棘影目",  // iNat
  "3:Echinolampadacea": "灯海胆目",  // iNat
  "3:Echinoneoida": "斜海胆目",  // iNat
  "3:Echinorhagata": "棘裂目",  // iNat
  "3:Echinorhynchida": "棘吻目",  // iNat
  "3:Echinothurioida": "柔海胆目",  // iNat
  "3:Echiuroidea": "螠虫目",  // iNat
  "3:Elasipodida": "平足目",  // iNat
  "3:Ellobiida": "耳螺目",  // iNat
  "3:Ellobiopsida": "耳形虫目",  // iNat
  "3:Elopiformes": "海鲢目",  // iNat
  "3:Embioptera": "纺足目",  // iNat
  "3:Encalyptales": "大帽藓目",  // iNat
  "3:Endogonales": "内生菌目",  // iNat
  "3:Enoplida": "刺嘴目",  // iNat
  "3:Entomobryomorpha": "长角跳虫目",  // iNat
  "3:Entomophthorales": "虫霉目",  // iNat
  "3:Entorrhizales": "根肿黑粉菌目",  // iNat
  "3:Entwisleiales": "恩特藻目",  // iNat
  "3:Entylomatales": "叶黑粉菌目",  // iNat
  "3:Ephedrales": "麻黄目",  // iNat
  "3:Equisetales": "木贼目",  // iNat
  "3:Erythrobasidiales": "线黑粉菌目",  // iNat
  "3:Escalloniales": "南鼠刺目",  // iNat
  "3:Eucoccidiorida": "真球虫目",  // iNat
  "3:Euglenales": "裸藻目",  // iNat
  "3:Eunicida": "矶沙蚕目",  // iNat
  "3:Eunotiales": "短缝藻目",  // iNat
  "3:Euphausiacea": "磷虾目",  // iNat
  "3:Euplotida": "游仆目",  // iNat
  "3:Eurotiales": "散囊菌目",  // iNat
  "3:Euryalida": "蔓蛇尾目",  // iNat
  "3:Eurypygiformes": "日𫛚目",  // iNat
  "3:Exobasidiales": "外担菌目",  // iNat
  "3:Fecampiida": "费康涡虫目",  // iNat
  "3:Filospermoidea": "丝精目",  // iNat
  "3:Forcipulatida": "钳棘目",  // iNat
  "3:Fossombroniales": "小叶苔目",  // iNat
  "3:Fragilariales": "脆杆藻目",  // iNat
  "3:Funariales": "葫芦藓目",  // iNat
  "3:Gadilida": "梭角贝目",  // iNat
  "3:Galeommatida": "鼬眼蛤目",  // iNat
  "3:Ganeshida": "美光水母目",  // iNat
  "3:Garryales": "丝缨花目",  // iNat
  "3:Gastrochaenida": "开腹蛤目",  // iNat
  "3:Gaviiformes": "潜鸟目",  // iNat
  "3:Geastrales": "地星目",  // iNat
  "3:Gelidiales": "石花菜目",  // iNat
  "3:Gelyelloida": "隐水蚤目",  // iNat
  "3:Geoglossales": "地舌菌目",  // iNat
  "3:Geophilomorpha": "地蜈蚣目",  // iNat
  "3:Georgefischeriales": "乔氏黑粉菌目",  // iNat
  "3:Geraniales": "牻牛儿苗目",  // iNat
  "3:Gigartinales": "杉藻目",  // iNat
  "3:Gigaspermales": "大蒴藓目",  // iNat
  "3:Ginkgoales": "银杏目",  // iNat
  "3:Glaucocystales": "灰藻目",  // iNat
  "3:Glaucosphaerales": "灰球藻目",  // iNat
  "3:Gleicheniales": "里白目",  // iNat
  "3:Gloeophyllales": "黏褶菌目",  // iNat
  "3:Glomerales": "球囊霉目",  // iNat
  "3:Glomerellales": "小丛壳菌目",  // iNat
  "3:Glomerida": "球马陆目",  // iNat
  "3:Glomeridesmida": "球带马陆目",  // iNat
  "3:Gnetales": "买麻藤目",  // iNat
  "3:Gnosonesimida": "极地涡虫目",  // iNat
  "3:Gomphales": "钉菇目",  // iNat
  "3:Gonorynchiformes": "鼠𬶮目",  // iNat
  "3:Gonyaulacales": "膝沟藻目",  // iNat
  "3:Gordioidea": "铁线虫目",  // iNat
  "3:Gracilariales": "江蓠目",  // iNat
  "3:Grimmiales": "紫萼藓目",  // iNat
  "3:Gunnerales": "大叶草目",  // iNat
  "3:Gymnodiniales": "裸甲藻目",  // iNat
  "3:Gymnophiona": "蚓螈目",  // iNat 给了「无足目」，与海参纲 Apodida 撞名，改用通行的蚓螈目
  "3:Gymnotiformes": "裸背鱼目",  // iNat
  "3:Haemospororida": "血孢子虫目",  // iNat
  "3:Halocyprida": "海介虫目",  // iNat
  "3:Halymeniales": "海膜目",  // iNat
  "3:Hapalidiales": "混石藻目",  // iNat
  "3:Haplosclerida": "单骨海绵目",  // iNat
  "3:Haptorida": "刺钩目",  // iNat
  "3:Harpacticoida": "猛水蚤目",  // iNat
  "3:Harpellales": "钩孢毛菌目",  // iNat
  "3:Harpetida": "镰虫目",  // iNat
  "3:Hedwigiales": "虎尾藓目",  // iNat
  "3:Helicobasidiales": "卷担子菌目",  // iNat
  "3:Helotiales": "柔膜菌目",  // iNat
  "3:Hemiaulales": "半管藻目",  // iNat
  "3:Heterodontiformes": "虎鲨目",  // iNat
  "3:Heteronemertea": "异纽目",  // iNat
  "3:Heterotrichida": "异毛目",  // iNat
  "3:Hexamerocerata": "六少足目",  // iNat
  "3:Hexanchiformes": "六鳃鲨目",  // iNat
  "3:Hildenbrandiales": "胭脂藻目",  // iNat
  "3:Holasteroida": "全星海胆目",  // iNat
  "3:Holothuriida": "海参目",  // iNat
  "3:Holothyrida": "巨螨目",  // iNat
  "3:Holtermanniales": "胶珊瑚菌目",  // iNat
  "3:Homosclerophorida": "同骨海绵目",  // iNat
  "3:Hookeriales": "油藓目",  // iNat
  "3:Huerteales": "腺椒树目",  // iNat
  "3:Hydrurales": "水树藻目",  // iNat
  "3:Hymeneliales": "膜衣目",  // iNat
  "3:Hymenophyllales": "膜蕨目",  // iNat
  "3:Hyocrinida": "骨海百合目",  // iNat
  "3:Hyphochytriales": "丝壶菌目",  // iNat
  "3:Hypnales": "灰藓目",  // iNat
  "3:Hypnodendrales": "树灰藓目",  // iNat
  "3:Hypopterygiales": "孔雀藓目",  // iNat
  "3:Hyracoidea": "蹄兔目",  // iNat
  "3:Hysterangiales": "辐片包目",  // iNat
  "3:Hysteriales": "纵裂菌目",  // iNat
  "3:Icacinales": "茶茱萸目",  // iNat
  "3:Idiosepida": "微鳍乌贼目",  // iNat
  "3:Isocrinida": "等节海百合目",  // iNat
  "3:Isoetales": "水韭目",  // iNat
  "3:Isopoda": "等足目",  // iNat
  "3:Ixodida": "蜱目",  // iNat
  "3:Julida": "姬马陆目",  // iNat
  "3:Jungermanniales": "叶苔目",  // iNat
  "3:Kentrorhagata": "刺裂目",  // iNat
  "3:Kickxellales": "梳霉目",  // iNat
  "3:Kiitrichida": "凯毛目",  // iNat
  "3:Klebsormidiales": "克里藻目",  // iNat
  "3:Laboulbeniales": "虫囊菌目",  // iNat
  "3:Labyrinthulida": "迷宫虫目",  // iNat
  "3:Lamniformes": "鼠鲨目",  // iNat
  "3:Lampriformes": "月鱼目",  // iNat
  "3:Laurales": "樟目",  // iNat
  "3:Laurida": "树囊虱目",  // iNat
  "3:Lecideales": "网衣目",  // iNat
  "3:Leiosporocerotales": "光孢角苔目",  // iNat
  "3:Leotiales": "锤舌菌目",  // iNat
  "3:Lepetellida": "小笠螺目",  // iNat
  "3:Lepidopleurida": "鳞侧石鳖目",  // iNat
  "3:Lepidostromatales": "莲叶衣目",  // iNat
  "3:Lepisosteiformes": "雀鳝目",  // iNat
  "3:Leptosomiformes": "鹃𫁡目",  // iNat
  "3:Leptostraca": "叶虾目",  // iNat
  "3:Leptothecata": "软水母目",  // iNat
  "3:Leucosolenida": "白枝海绵目",  // iNat
  "3:Leucosporidiales": "白冬孢酵母目",  // iNat
  "3:Lichinales": "异极衣目",  // iNat
  "3:Licmophorales": "楔形藻目",  // iNat
  "3:Licnophorida": "丽壳目",  // iNat
  "3:Limida": "锉蛤目",  // iNat
  "3:Limnognathida": "颚虫目",  // iNat
  "3:Limnomedusae": "淡水水母目",  // iNat
  "3:Lingulida": "舌形贝目",  // iNat
  "3:Lithobiomorpha": "石蜈蚣目",  // iNat
  "3:Lithonida": "网海绵目",  // iNat
  "3:Littorinimorpha": "滨螺形目",  // iNat
  "3:Lituolida": "曲杖虫目",  // iNat
  "3:Lobata": "兜水母目",  // iNat
  "3:Lophogastrida": "疣背糠虾目",  // iNat
  "3:Lucinida": "满月蛤目",  // iNat
  "3:Lunulariales": "半月苔目",  // iNat
  "3:Lychniscosida": "灯笼海绵目",  // iNat
  "3:Lycopodiales": "石松目",  // iNat
  "3:Lyssacinosida": "松骨海绵目",  // iNat
  "3:Macroscelidea": "象鼩目",  // iNat
  "3:Magnaporthales": "巨座壳目",  // iNat
  "3:Malacalcyonacea": "软珊瑚目",  // iNat
  "3:Malasseziales": "马拉色菌目",  // iNat
  "3:Mamiellales": "小豆藻目",  // iNat
  "3:Marattiales": "合囊蕨目",  // iNat
  "3:Marchantiales": "地钱目",  // iNat
  "3:Mastogloiales": "曲壳藻目",  // iNat
  "3:Mecoptera": "长翅目",  // iNat
  "3:Medeolariales": "梭绒盘菌目",  // iNat
  "3:Megaloptera": "广翅目",  // iNat
  "3:Meiopriapulomorpha": "溲曳鳃目",  // iNat
  "3:Melanosporales": "黑壳孢目",  // iNat
  "3:Meliolales": "小煤炱目",  // iNat
  "3:Melosirales": "直链藻目",  // iNat
  "3:Merliida": "梅尔海绵目",  // iNat
  "3:Mermithida": "索线目",  // iNat
  "3:Mesitornithiformes": "拟鹑目",  // iNat
  "3:Mesostigmata": "中气门目",  // iNat
  "3:Mesostigmatales": "中斑藻目",  // iNat
  "3:Metteniusales": "水螅花目",  // iNat
  "3:Metzgeriales": "叉苔目",  // iNat
  "3:Microascales": "小囊菌目",  // iNat
  "3:Microbiotheria": "微兽目",  // iNat
  "3:Microbotryales": "微球黑粉菌目",  // iNat
  "3:Micropygoida": "微臀海胆目",  // iNat
  "3:Microstromatales": "微座孢目",  // iNat
  "3:Microthamniales": "小丛藻目",  // iNat
  "3:Miliolida": "粟虫目",  // iNat
  "3:Mischococcales": "杂球藻目",  // iNat
  "3:Misophrioida": "异水蚤目",  // iNat
  "3:Mixiales": "混合菌目",  // iNat
  "3:Molpadida": "芋参目",  // iNat
  "3:Monhysterida": "单宫目",  // iNat
  "3:Moniliellales": "丛梗孢菌目",  // iNat
  "3:Monoblastiales": "单芽菌目",  // iNat
  "3:Monoblepharidales": "单毛菌目",  // iNat
  "3:Mononchida": "单齿目",  // iNat
  "3:Monotremata": "单孔目",  // iNat
  "3:Monstrilloida": "怪水蚤目",  // iNat
  "3:Mormonilloida": "摩门水蚤目",  // iNat
  "3:Mortierellales": "被孢霉目",  // iNat
  "3:Mucorales": "毛霉菌目",  // iNat
  "3:Multivalvulida": "多壳目",  // iNat
  "3:Musophagiformes": "蕉鹃目",  // iNat
  "3:Mycocaliciales": "粉菌衣目",  // iNat
  "3:Mycosphaerellales": "球腔菌目",  // iNat
  "3:Myctophiformes": "灯笼鱼目",  // iNat
  "3:Myida": "海螂目",  // iNat
  "3:Myliobatiformes": "鲼形目",  // iNat
  "3:Myodocopida": "壮肢目",  // iNat
  "3:Myopsida": "闭眼目",  // iNat
  "3:Myriangiales": "多腔菌目",  // iNat
  "3:Myrmecridiales": "蚁霉目",  // iNat
  "3:Mysida": "糠虾目",  // iNat
  "3:Mystacocaridida": "须虾目",  // iNat
  "3:Mytilida": "贻贝目",  // iNat
  "3:Myxiniformes": "盲鳗目",  // iNat
  "3:Nanaloricida": "小铠甲虫目",  // iNat
  "3:Naohideales": "尚秀花耳目",  // iNat
  "3:Narcomedusae": "刚水母目",  // iNat
  "3:Nassellaria": "罩笼虫目",  // iNat
  "3:Nassulida": "篮口目",  // iNat
  "3:Nautilida": "鹦鹉螺目",  // iNat
  "3:Naviculales": "舟形藻目",  // iNat
  "3:Nectiopoda": "泳足目",  // iNat
  "3:Nectonematoidea": "游线虫目",  // iNat
  "3:Neelipleona": "短角跳目",  // iNat
  "3:Nemaliales": "海索面目",  // iNat
  "3:Nemastomatales": "滑线藻目",  // iNat
  "3:Nemertodermatida": "纽皮纲",  // iNat
  "3:Neocallimastigales": "新美鞭菌目",  // iNat
  "3:Neogastropoda": "新腹足目",  // iNat
  "3:Neohodgsoniales": "叉托苔目",  // iNat
  "3:Neolectales": "粒毛盘菌目",  // iNat
  "3:Neomphalida": "新脐螺目",  // iNat
  "3:Neopilinida": "新蝶贝目",  // iNat
  "3:Nephroselmidales": "肾爿藻目",  // iNat
  "3:Noctilucales": "夜光藻目",  // iNat
  "3:Nodosariida": "节房虫目",  // iNat
  "3:Notacanthiformes": "背棘鱼目",  // iNat
  "3:Notoryctemorphia": "袋鼹目",  // iNat
  "3:Notostraca": "背甲目",  // iNat
  "3:Notothyladales": "短角苔目",  // iNat
  "3:Nucleariida": "核形虫目",  // iNat
  "3:Nuculanida": "吻状蛤目",  // iNat
  "3:Nuculida": "胡桃蛤目",  // iNat
  "3:Nudibranchia": "裸鳃目",  // iNat
  "3:Nyctibiiformes": "林鸱目",  // iNat
  "3:Nymphaeales": "睡莲目",  // iNat
  "3:Ochromonadales": "棕鞭藻目",  // iNat
  "3:Octopoda": "八腕目",  // iNat
  "3:Oedipodiales": "长台藓目",  // iNat
  "3:Oedogoniales": "鞘藻目",  // iNat
  "3:Oegopsida": "开眼目",  // iNat
  "3:Olpidiales": "油壶菌目",  // iNat
  "3:Onygenales": "爪甲团囊菌目",  // iNat
  "3:Ophiacanthida": "棘蛇尾目",  // iNat
  "3:Ophidiiformes": "蛇鳚目",  // iNat
  "3:Ophioglossales": "瓶尔小草目",  // iNat
  "3:Ophioleucida": "白蛇尾目",  // iNat
  "3:Ophioscolecida": "虫蛇尾目",  // iNat
  "3:Ophiostomatales": "蛇口壳目",  // iNat
  "3:Opilioacarida": "节腹螨目",  // iNat
  "3:Opiliones": "盲蛛目",  // iNat
  "3:Opisthocomiformes": "麝雉目",  // iNat
  "3:Orbiliales": "圆盘菌目",  // iNat
  "3:Orectolobiformes": "须鲨目",  // iNat
  "3:Orthotrichales": "木灵藓目",  // iNat
  "3:Osmeriformes": "胡瓜鱼目",  // iNat
  "3:Osmundales": "紫萁目",  // iNat
  "3:Ostreida": "牡蛎目",  // iNat
  "3:Ostropales": "厚顶盘菌目",  // iNat
  "3:Otidiformes": "鸨形目",  // iNat
  "3:Oxalidales": "酢浆草目",  // iNat
  "3:Oxyrrhinales": "尖尾藻目",  // iNat
  "3:Pallaviciniales": "带叶苔目",  // iNat
  "3:Palmariales": "紫红藻目",  // iNat
  "3:Palpigradi": "须脚目",  // iNat
  "3:Pandanales": "露兜树目",  // iNat
  "3:Pantopoda": "海蜘蛛目",  // iNat
  "3:Parachela": "异爪目",  // iNat
  "3:Paracryphiales": "盔被花目",  // iNat
  "3:Paraglomerales": "类球囊霉目",  // iNat
  "3:Patellariales": "胶皿菌目",  // iNat
  "3:Paucituberculata": "鼩负鼠目",  // iNat
  "3:Paxillosida": "桩海星目",  // iNat
  "3:Pectinida": "扇贝目",  // iNat
  "3:Pedinoida": "平海胆目",  // iNat
  "3:Pedinomonadales": "平藻目",  // iNat
  "3:Pelliales": "溪苔目",  // iNat
  "3:Peltigerales": "地卷目",  // iNat
  "3:Peniculida": "咽膜目",  // iNat
  "3:Peramelemorphia": "袋狸目",  // iNat
  "3:Peranemida": "袋鞭藻目",  // iNat
  "3:Percopsiformes": "鲑鲈目",  // iNat
  "3:Peridiniales": "多甲藻目",  // iNat
  "3:Peripodida": "海雏菊目",  // iNat
  "3:Peronosporales": "霜霉目",  // iNat
  "3:Persiculida": "拟刺参目",  // iNat
  "3:Pertusariales": "鸡皮衣目",  // iNat
  "3:Petromyzontiformes": "七鳃鳗目",  // iNat
  "3:Petrosaviales": "无叶莲目",  // iNat
  "3:Peyssonneliales": "耳壳藻目",  // iNat
  "3:Phacidiales": "星裂盘菌目",  // iNat
  "3:Phacopida": "镜眼虫目",  // iNat
  "3:Phaeothamniales": "褐枝藻目",  // iNat
  "3:Phaethontiformes": "热带鸟目",  // iNat 给了「鹲形目」，与上手填的 Suliformes 撞名
  "3:Philasterida": "嗜污目",  // iNat
  "3:Phlebobranchia": "静腮目",  // iNat
  "3:Phoenicopteriformes": "红鹳目",  // iNat
  "3:Pholidota": "鳞甲目",  // iNat
  "3:Phragmophora": "腹横肌目",  // iNat
  "3:Phyllachorales": "黑痣菌目",  // iNat
  "3:Phyllodocida": "叶须虫目",  // iNat
  "3:Phymatocerotales": "肿角苔目",  // iNat
  "3:Physarales": "绒泡菌目",  // iNat
  "3:Phytodiniales": "植甲藻目",  // iNat
  "3:Picocystales": "尘囊藻目",  // iNat
  "3:Picramniales": "美洲苦木目",  // iNat
  "3:Pihiellales": "纽扣藻目",  // iNat
  "3:Pilosa": "披毛目",  // iNat
  "3:Piperales": "胡椒目",  // iNat
  "3:Plasmodiophorida": "原质目",  // iNat
  "3:Platycopida": "简肢亚纲",  // iNat
  "3:Platycopioida": "平角目",  // iNat
  "3:Platyctenida": "扁栉水母目",  // iNat
  "3:Platydesmida": "扁带马陆目",  // iNat
  "3:Platygloeales": "泛胶耳目",  // iNat
  "3:Plecoptera": "𫌀翅目",  // iNat
  "3:Plectida": "绕线目",  // iNat
  "3:Pleosporales": "格孢腔菌目",  // iNat
  "3:Pleurobranchida": "侧鳃目",  // iNat
  "3:Pleuronematida": "帆口目",  // iNat
  "3:Pleurostomatida": "侧口目",  // iNat
  "3:Pleurotomariida": "翁戎螺目",  // iNat
  "3:Pleuroziales": "紫叶苔目",  // iNat
  "3:Plocamiales": "海头红目",  // iNat
  "3:Ploima": "游泳轮虫目",  // iNat
  "3:Plumatellida": "羽苔目",  // iNat
  "3:Podocopida": "尾肢目",  // iNat
  "3:Poduromorpha": "原跳虫目",  // iNat
  "3:Poecilosclerida": "异骨海绵目",  // iNat
  "3:Polyarthra": "小管水蚤目",  // iNat
  "3:Polydesmida": "带马陆目",  // iNat
  "3:Polymastiida": "多鞭海绵目",  // iNat
  "3:Polymixiiformes": "须鳂目",  // iNat
  "3:Polymorphida": "多型目",  // iNat
  "3:Polypodiales": "水龙骨目",  // iNat
  "3:Polypteriformes": "多鳍鱼目",  // iNat
  "3:Polytrichales": "金发藓目",  // iNat
  "3:Polyxenida": "毛马陆目",  // iNat
  "3:Polyzoniida": "多板马陆目",  // iNat
  "3:Porellales": "光萼苔目",  // iNat
  "3:Porocephalida": "孔头舌虫目",  // iNat
  "3:Porphyridiales": "紫球藻目",  // iNat
  "3:Pottiales": "丛藓目",  // iNat
  "3:Prasinococcales": "葱绿藻目",  // iNat
  "3:Prasiolales": "溪菜目",  // iNat
  "3:Priapulomorpha": "曳鳃目",  // iNat
  "3:Pristiophoriformes": "锯鲨目",  // iNat
  "3:Procellariiformes": "鹱形目",  // iNat
  "3:Proetida": "砑头虫目",  // iNat
  "3:Prolecithophora": "原卵黄目",  // iNat
  "3:Prorhynchida": "卵黄上皮目",  // iNat
  "3:Prorocentrales": "原甲藻目",  // iNat
  "3:Prorodontida": "前管虫目",  // iNat
  "3:Proseriata": "原顺列目",  // iNat
  "3:Prostomatida": "前口目",  // iNat
  "3:Proteales": "山龙眼目",  // iNat
  "3:Protosteliales": "原柱黏菌目",  // iNat
  "3:Protura": "原尾目",  // iNat
  "3:Prymnesiales": "土栖藻目",  // iNat
  "3:Pseudoscorpiones": "拟蝎目",  // iNat
  "3:Psilotales": "松叶蕨目",  // iNat
  "3:Psocodea": "啮目",  // iNat
  "3:Pteropoda": "翼足目",  // iNat
  "3:Ptilidiales": "毛叶苔目",  // iNat
  "3:Ptychopariida": "褶颊虫目",  // iNat
  "3:Pucciniales": "柄锈菌目",  // iNat
  "3:Pyramimonadales": "塔胞藻目",  // iNat
  "3:Pyrenomonadales": "核隐藻目",  // iNat
  "3:Pyrenulales": "小核衣目",  // iNat
  "3:Pyrosomatida": "磷海樽目",  // iNat
  "3:Rajiformes": "鳐目",  // iNat
  "3:Ralfsiales": "褐壳藻目",  // iNat
  "3:Raphidioptera": "蛇蛉目",  // iNat
  "3:Redlichiida": "莱得利基虫目",  // iNat
  "3:Rhabditida": "小杆线虫目",  // iNat
  "3:Rhabdocoela": "单肠目",  // iNat
  "3:Rhabdonematales": "杆线藻目",  // iNat
  "3:Rheiformes": "美洲鸵目",  // iNat
  "3:Rhinopristiformes": "犁头鳐目",  // iNat
  "3:Rhipidiales": "囊轴霉目",  // iNat
  "3:Rhizocarpales": "地图衣目",  // iNat
  "3:Rhizochloridales": "根黄藻目",  // iNat
  "3:Rhizogoniales": "桧藓目",  // iNat
  "3:Rhizophydiales": "根生壶菌目",  // iNat
  "3:Rhizosoleniales": "管状硅藻目",  // iNat
  "3:Rhizostomeae": "根口水母目",  // iNat
  "3:Rhodachlyales": "红迷藻目",  // iNat
  "3:Rhodellales": "红球藻目",  // iNat
  "3:Rhodochaetales": "红刺藻目",  // iNat
  "3:Rhodogorgonales": "红女妖藻目",  // iNat
  "3:Rhodymeniales": "红皮藻目",  // iNat
  "3:Rhopalodiales": "窗纹藻目",  // iNat
  "3:Rhynchobdellida": "吻蛭目",  // iNat
  "3:Rhynchonellida": "小嘴贝目",  // iNat
  "3:Rhytismatales": "斑痣盘菌目",  // iNat
  "3:Ricinulei": "蜱蛛目",  // iNat
  "3:Rotaliida": "车轮虫目",  // iNat
  "3:Rufusiales": "树懒红藻目",  // iNat
  "3:Runcinida": "羽叶鳃目",  // iNat
  "3:Sabellida": "缨鳃虫目",  // iNat
  "3:Saccharomycetales": "酵母目",  // iNat
  "3:Salenioida": "沙棱海胆目",  // iNat
  "3:Salpida": "纽鳃樽目",  // iNat
  "3:Salviniales": "槐叶萍目",  // iNat
  "3:Santalales": "檀香目",  // iNat
  "3:Saprolegniales": "水霉目",  // iNat
  "3:Sarcoptiformes": "疥螨目",  // iNat
  "3:Sareales": "树脂菌目",  // iNat
  "3:Saxifragales": "虎耳草目",  // iNat
  "3:Scandentia": "树鼩目",  // iNat
  "3:Sceptrulophora": "孔网海绵目",  // iNat
  "3:Schizaeales": "莎草蕨目",  // iNat
  "3:Schizomida": "裂盾目",  // iNat
  "3:Scleractinia": "石珊瑚目",  // iNat
  "3:Scleralcyonacea": "海鳃亚目",  // iNat
  "3:Scolopendromorpha": "蜈蚣目",  // iNat
  "3:Scopalinida": "象耳海绵目",  // iNat
  "3:Scourfieldiales": "心胞藻目",  // iNat
  "3:Scutigeromorpha": "蚰蜒目",  // iNat
  "3:Sebacinales": "蜡壳耳目",  // iNat
  "3:Sebdeniales": "黏滑藻目",  // iNat
  "3:Seguenziida": "陀螺目",  // iNat
  "3:Seisonacea": "摇轮虫目",  // iNat
  "3:Selaginellales": "卷柏目",  // iNat
  "3:Semaeostomeae": "旗口水母目",  // iNat
  "3:Sepiida": "乌贼目",  // iNat
  "3:Septobasidiales": "隔担菌目",  // iNat
  "3:Siphonaptera": "蚤目",  // iNat
  "3:Siphonariida": "松螺目",  // iNat
  "3:Siphoniulida": "小管马陆目",  // iNat
  "3:Siphonocryptida": "隐管马陆目",  // iNat
  "3:Siphonophorae": "管水母目",  // iNat
  "3:Siphonophorida": "管马陆目",  // iNat
  "3:Siphonostomatoida": "鱼虱目",  // iNat
  "3:Sirenia": "海牛目",  // iNat
  "3:Solemyida": "蛏螂目",  // iNat
  "3:Solifugae": "避日目",  // iNat
  "3:Sordariales": "粪壳目",  // iNat
  "3:Spatangoida": "心形海胆目",  // iNat
  "3:Sphacelariales": "黑顶藻目",  // iNat
  "3:Sphaeriida": "球蚬​目",  // iNat
  "3:Sphaerocarpales": "囊果苔目",  // iNat
  "3:Sphaerocladina": "球裂海绵目",  // iNat
  "3:Sphaeropleales": "环藻目",  // iNat
  "3:Sphaerotheriida": "圆马陆目",  // iNat
  "3:Sphagnales": "泥炭藓目",  // iNat
  "3:Sphenisciformes": "企鹅目",  // iNat
  "3:Spinulosida": "有棘目",  // iNat
  "3:Spirobolida": "山蛩目",  // iNat
  "3:Spirostreptida": "异蛩目",  // iNat
  "3:Spirulida": "小旋鱿目",  // iNat
  "3:Splachnales": "壶藓目",  // iNat
  "3:Spongillida": "淡水海绵目",  // iNat
  "3:Sporidiobolales": "锁掷酵母目",  // iNat
  "3:Sporochnales": "毛头藻目",  // iNat
  "3:Sporolithales": "孢石藻目",  // iNat
  "3:Spumellaria": "泡沫虫目",  // iNat
  "3:Squaliformes": "角鲨目",  // iNat
  "3:Squatiniformes": "扁鲨目",  // iNat
  "3:Stauromedusae": "十字水母目",  // iNat
  "3:Steatornithiformes": "油鸱目",  // iNat
  "3:Stemmiulida": "捷马陆目",  // iNat
  "3:Stemonitidales": "发网菌目",  // iNat
  "3:Stereopsidales": "拟韧革菌目",  // iNat
  "3:Stichotrichida": "排毛目",  // iNat
  "3:Stolidobranchia": "复腮目",  // iNat
  "3:Stomatopoda": "口足目",  // iNat
  "3:Stomiiformes": "巨口鱼目",  // iNat
  "3:Stomopneustoida": "口鳃海胆目",  // iNat
  "3:Strepsiptera": "捻翅目",  // iNat
  "3:Strigulales": "叶上衣目",  // iNat
  "3:Strombidiida": "急游目",  // iNat
  "3:Struthioniformes": "鸵形目",  // iNat
  "3:Stylommatophora": "柄眼目",  // iNat
  "3:Stylonematales": "茎丝藻目",  // iNat
  "3:Suberitida": "皮海绵目",  // iNat
  "3:Surirellales": "双菱藻目",  // iNat
  "3:Symbiida": "共生虫目",  // iNat
  "3:Symphypleona": "愈腹目",  // iNat
  "3:Synallactida": "楯手目",  // iNat
  "3:Synbranchiformes": "合鳃鱼目",  // iNat
  "3:Syndiniales": "共甲藻目",  // iNat
  "3:Synurales": "黄群藻目",  // iNat
  "3:Systellommatophora": "并眼目",  // iNat
  "3:Takakiales": "藻藓目",  // iNat
  "3:Tanaidacea": "原足目",  // iNat
  "3:Taphrinales": "外囊菌目",  // iNat
  "3:Telonemida": "网鞭虫目",  // iNat
  "3:Teloschistales": "黄枝衣目",  // iNat
  "3:Terebratulida": "钻孔贝目",  // iNat
  "3:Tethyida": "荔枝海绵目",  // iNat
  "3:Tetractinellida": "四放海绵目",  // iNat
  "3:Tetramerocerata": "四少足目",  // iNat
  "3:Tetraphidales": "四齿藓目",  // iNat
  "3:Tetraphyllidea": "四叶目",  // iNat
  "3:Tetrasporales": "四孢藻目",  // iNat
  "3:Textulariida": "编织虫目",  // iNat
  "3:Thalassiophysales": "海螺藻目",  // iNat
  "3:Thalassiosirales": "海链藻目",  // iNat
  "3:Thalassocalycida": "海萼水母目",  // iNat
  "3:Thecideida": "鞘贝目",  // iNat
  "3:Thelebolales": "寡囊盘菌目",  // iNat
  "3:Thelephorales": "革菌目",  // iNat
  "3:Thermosbaenacea": "温泉虾目",  // iNat
  "3:Thermozodia": "温泉水熊虫目",  // iNat
  "3:Thoreales": "红索藻目",  // iNat
  "3:Thraustochytrida": "破囊壶菌目",  // iNat
  "3:Thysanoptera": "缨翅目",  // iNat
  "3:Tilletiales": "腥黑粉菌目",  // iNat
  "3:Timmiales": "美姿藓目",  // iNat
  "3:Tinamiformes": "䳍形目",  // iNat
  "3:Tintinnida": "砂壳目",  // iNat
  "3:Torpediniformes": "电鳐目",  // iNat
  "3:Toxariales": "托氏藻目",  // iNat
  "3:Trachycladida": "糙裂海绵目",  // iNat
  "3:Trachymedusae": "硬水母目",  // iNat
  "3:Trebouxiales": "共球藻目",  // iNat
  "3:Trechisporales": "糙孢孔目",  // iNat
  "3:Trentepohliales": "橘色藻目",  // iNat
  "3:Treubiales": "陶氏苔目",  // iNat
  "3:Tribonematales": "黄丝藻目",  // iNat
  "3:Trichiales": "团毛菌目",  // iNat
  "3:Trichinellida": "毛形线虫目",  // iNat
  "3:Trichosphaeriales": "假毛球壳目",  // iNat
  "3:Tricladida": "三肠目",  // iNat
  "3:Trigoniida": "三角蛤目",  // iNat
  "3:Triplonchida": "三矛目",  // iNat
  "3:Trochida": "钟螺目",  // iNat
  "3:Trochodendrales": "昆栏树目",  // iNat
  "3:Trogoniformes": "咬鹃目",  // iNat
  "3:Trombidiformes": "绒螨目",  // iNat
  "3:Trypetheliales": "乳嘴衣目",  // iNat
  "3:Tubeufiales": "毛筒壳目",  // iNat
  "3:Tubulidentata": "管齿目",  // iNat
  "3:Ulotrichales": "丝藻目",  // iNat
  "3:Ulvales": "石莼目",  // iNat
  "3:Umbilicariales": "石耳目",  // iNat
  "3:Umbraculida": "伞螺目",  // iNat
  "3:Unionida": "蚌目",  // iNat
  "3:Urocystidales": "条黑粉菌目",  // iNat
  "3:Uropygi": "鞭蝎目",  // iNat
  "3:Urostylida": "尾柱目",  // iNat
  "3:Ustilaginales": "黑粉菌目",  // iNat
  "3:Vahliales": "黄漆姑目",  // iNat
  "3:Valvatida": "瓣海星目",  // iNat
  "3:Vampyromorpha": "幽灵蛸目",  // iNat
  "3:Vaucheriales": "无隔藻目",  // iNat
  "3:Velatida": "有缘目",  // iNat
  "3:Venerida": "帘蛤目",  // iNat
  "3:Venturiales": "黑星菌目",  // iNat
  "3:Verongiida": "真海绵目",  // iNat
  "3:Verrucariales": "瓶口衣目",  // iNat
  "3:Vezdaeales": "维氏衣目",  // iNat
  "3:Vitales": "葡萄目",  // iNat
  "3:Wallemiales": "节担菌目",  // iNat
  "3:Welwitschiales": "百岁兰目",  // iNat
  "3:Xenosomata": "外动吻虫目",  // iNat
  "3:Xiphosurida": "剑尾目",  // iNat
  "3:Xylonales": "木菌目",  // iNat
  "3:Zeiformes": "海鲂目",  // iNat
  "3:Zoantharia": "群海葵目",  // iNat
  "3:Zoopagales": "捕虫菌目",  // iNat
  "3:Zoraptera": "缺翅目",  // iNat
  "3:Zygentoma": "衣鱼目",  // iNat
  "3:Zygnematales": "双星藻目",  // iNat
  "3:Zygophyllales": "蒺藜目",  // iNat
  // ── 离线配表结束 ──
};

/** 取骨架节点的显示名：有中文名用中文，否则退回拉丁名。 */
export function backboneLabel(id: string, latin: string): string {
  return BACKBONE_ZH[id] ?? latin;
}
