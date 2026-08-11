/**
 * ISO 3166-1 映射与国别归一化。
 *
 * 这是国别判定的**唯一出口**：无论来源是天地图逆地理（中文国名）还是离线
 * 点在多边形判定（ISO numeric），都必须经过这里转成 alpha-2。
 * 合规规则（台湾/香港/澳门归入 CN）只写在本文件，不得散落到调用方。
 */

/** ISO 3166-1 numeric → alpha-2。离线数据（TopoJSON id）用，需保持完整。 */
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  "004": "AF", "008": "AL", "012": "DZ", "016": "AS", "020": "AD", "024": "AO",
  "028": "AG", "031": "AZ", "032": "AR", "036": "AU", "040": "AT", "044": "BS",
  "048": "BH", "050": "BD", "051": "AM", "052": "BB", "056": "BE", "060": "BM",
  "064": "BT", "068": "BO", "070": "BA", "072": "BW", "076": "BR", "084": "BZ",
  "090": "SB", "096": "BN", "100": "BG", "104": "MM", "108": "BI", "112": "BY",
  "116": "KH", "120": "CM", "124": "CA", "132": "CV", "140": "CF", "144": "LK",
  "148": "TD", "152": "CL", "156": "CN", "158": "TW", "170": "CO", "174": "KM",
  "178": "CG", "180": "CD", "184": "CK", "188": "CR", "191": "HR", "192": "CU",
  "196": "CY", "203": "CZ", "204": "BJ", "208": "DK", "212": "DM", "214": "DO",
  "218": "EC", "222": "SV", "226": "GQ", "231": "ET", "232": "ER", "233": "EE",
  "242": "FJ", "246": "FI", "250": "FR", "254": "GF", "258": "PF", "262": "DJ",
  "266": "GA", "268": "GE", "270": "GM", "275": "PS", "276": "DE", "288": "GH",
  "292": "GI", "296": "KI", "300": "GR", "304": "GL", "308": "GD", "312": "GP",
  "316": "GU", "320": "GT", "324": "GN", "328": "GY", "332": "HT", "340": "HN",
  "344": "HK", "348": "HU", "352": "IS", "356": "IN", "360": "ID", "364": "IR",
  "368": "IQ", "372": "IE", "376": "IL", "380": "IT", "384": "CI", "388": "JM",
  "392": "JP", "398": "KZ", "400": "JO", "404": "KE", "408": "KP", "410": "KR",
  "414": "KW", "417": "KG", "418": "LA", "422": "LB", "426": "LS", "428": "LV",
  "430": "LR", "434": "LY", "438": "LI", "440": "LT", "442": "LU", "446": "MO",
  "450": "MG", "454": "MW", "458": "MY", "462": "MV", "466": "ML", "470": "MT",
  "478": "MR", "480": "MU", "484": "MX", "492": "MC", "496": "MN", "498": "MD",
  "499": "ME", "504": "MA", "508": "MZ", "512": "OM", "516": "NA", "520": "NR",
  "524": "NP", "528": "NL", "540": "NC", "548": "VU", "554": "NZ", "558": "NI",
  "562": "NE", "566": "NG", "570": "NU", "578": "NO", "583": "FM", "584": "MH",
  "585": "PW", "586": "PK", "591": "PA", "598": "PG", "600": "PY", "604": "PE",
  "608": "PH", "616": "PL", "620": "PT", "624": "GW", "626": "TL", "630": "PR",
  "634": "QA", "638": "RE", "642": "RO", "643": "RU", "646": "RW", "659": "KN",
  "662": "LC", "670": "VC", "674": "SM", "678": "ST", "682": "SA", "686": "SN",
  "688": "RS", "690": "SC", "694": "SL", "702": "SG", "703": "SK", "704": "VN",
  "705": "SI", "706": "SO", "710": "ZA", "716": "ZW", "724": "ES", "728": "SS",
  "729": "SD", "732": "EH", "740": "SR", "748": "SZ", "752": "SE", "756": "CH",
  "760": "SY", "762": "TJ", "764": "TH", "768": "TG", "776": "TO", "780": "TT",
  "784": "AE", "788": "TN", "792": "TR", "795": "TM", "798": "TV", "800": "UG",
  "804": "UA", "807": "MK", "818": "EG", "826": "GB", "834": "TZ", "840": "US",
  "854": "BF", "858": "UY", "860": "UZ", "862": "VE", "882": "WS", "887": "YE",
  "894": "ZM",
};

/**
 * 天地图逆地理返回的中文国名 → alpha-2。
 * 实测其使用**常用简称**（美国 / 英国 / 韩国，而非全称）。
 * 此表不必穷举：未命中时会回落到离线判定，不会因缺项而出错。
 */
const ZH_NAME_TO_ALPHA2: Record<string, string> = {
  中国: "CN", 日本: "JP", 韩国: "KR", 朝鲜: "KP", 蒙古: "MN", 越南: "VN",
  老挝: "LA", 柬埔寨: "KH", 泰国: "TH", 缅甸: "MM", 马来西亚: "MY",
  新加坡: "SG", 印度尼西亚: "ID", 菲律宾: "PH", 文莱: "BN", 东帝汶: "TL",
  印度: "IN", 尼泊尔: "NP", 不丹: "BT", 孟加拉国: "BD", 斯里兰卡: "LK",
  马尔代夫: "MV", 巴基斯坦: "PK", 阿富汗: "AF", 哈萨克斯坦: "KZ",
  乌兹别克斯坦: "UZ", 吉尔吉斯斯坦: "KG", 塔吉克斯坦: "TJ",
  土库曼斯坦: "TM", 俄罗斯: "RU", 乌克兰: "UA", 白俄罗斯: "BY",
  土耳其: "TR", 伊朗: "IR", 伊拉克: "IQ", 以色列: "IL", 沙特阿拉伯: "SA",
  阿拉伯联合酋长国: "AE", 阿联酋: "AE", 卡塔尔: "QA", 科威特: "KW",
  阿曼: "OM", 约旦: "JO", 黎巴嫩: "LB", 叙利亚: "SY", 也门: "YE",
  格鲁吉亚: "GE", 亚美尼亚: "AM", 阿塞拜疆: "AZ",
  英国: "GB", 爱尔兰: "IE", 法国: "FR", 德国: "DE", 荷兰: "NL",
  比利时: "BE", 卢森堡: "LU", 瑞士: "CH", 奥地利: "AT", 意大利: "IT",
  西班牙: "ES", 葡萄牙: "PT", 希腊: "GR", 挪威: "NO", 瑞典: "SE",
  芬兰: "FI", 丹麦: "DK", 冰岛: "IS", 波兰: "PL", 捷克: "CZ",
  斯洛伐克: "SK", 匈牙利: "HU", 罗马尼亚: "RO", 保加利亚: "BG",
  塞尔维亚: "RS", 克罗地亚: "HR", 斯洛文尼亚: "SI", 爱沙尼亚: "EE",
  拉脱维亚: "LV", 立陶宛: "LT", 摩尔多瓦: "MD", 阿尔巴尼亚: "AL",
  美国: "US", 加拿大: "CA", 墨西哥: "MX", 古巴: "CU", 危地马拉: "GT",
  哥斯达黎加: "CR", 巴拿马: "PA", 巴西: "BR", 阿根廷: "AR", 智利: "CL",
  秘鲁: "PE", 玻利维亚: "BO", 哥伦比亚: "CO", 厄瓜多尔: "EC",
  委内瑞拉: "VE", 乌拉圭: "UY", 巴拉圭: "PY",
  澳大利亚: "AU", 新西兰: "NZ", 巴布亚新几内亚: "PG", 斐济: "FJ",
  埃及: "EG",摩洛哥: "MA", 阿尔及利亚: "DZ", 突尼斯: "TN",
  南非: "ZA", 肯尼亚: "KE", 坦桑尼亚: "TZ", 乌干达: "UG",
  埃塞俄比亚: "ET", 尼日利亚: "NG", 加纳: "GH", 塞内加尔: "SN",
  马达加斯加: "MG", 纳米比亚: "NA", 博茨瓦纳: "BW", 津巴布韦: "ZW",
  赞比亚: "ZM", 莫桑比克: "MZ",
};

/**
 * 归一化：台湾 / 香港 / 澳门在国别维度归入中国。
 *
 * 稀有度与引入种名录均按国家维度组织，无需也不应拆到地区级。
 * 注：天地图逆地理对台北直接返回 nation=「中国」，故API 路径天然合规；
 * 本映射主要用于离线数据（Natural Earth 系把三者单列）。
 */
const ALPHA2_ALIAS: Record<string, string> = {
  TW: "CN",
  HK: "CN",
  MO: "CN",
};

function normalizeAlpha2(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c || c.length !== 2) return null;
  return ALPHA2_ALIAS[c] ?? c;
}

/** 离线判定结果（ISO numeric）→ 归一化后的 alpha-2。 */
export function countryCodeFromNumeric(numeric: string | null | undefined): string | null {
  const key = numeric?.trim();
  if (!key) return null;
  const padded = key.padStart(3, "0");
  return normalizeAlpha2(NUMERIC_TO_ALPHA2[padded] ?? null);
}

/**
 * 天地图逆地理的 nation 字段 → 归一化后的 alpha-2。
 * 空字符串是合法返回（海上等无陆地归属），视为「无国别」返回 null。
 */
export function countryCodeFromZhName(nation: string | null | undefined): string | null {
  const name = nation?.trim();
  if (!name) return null;
  return normalizeAlpha2(ZH_NAME_TO_ALPHA2[name] ?? null);
}

/** 供已落库的旧数据迁移使用：把 TW/HK/MO 收敛到 CN。 */
export function normalizeStoredCountryCode(code: string | null | undefined): string | null {
  return normalizeAlpha2(code);
}

/** alpha-2 → 中文常用简称（旅途地点摘要用）；未录入则返回码本身。 */
const ALPHA2_TO_ZH: Record<string, string> = Object.fromEntries(
  Object.entries(ZH_NAME_TO_ALPHA2).map(([zh, code]) => [code, zh]),
);
// 常用简称优先（逆向建表时后写覆盖前写；显式钉死主名）
ALPHA2_TO_ZH.CN = "中国";
ALPHA2_TO_ZH.AE = "阿联酋";
ALPHA2_TO_ZH.US = "美国";
ALPHA2_TO_ZH.GB = "英国";
ALPHA2_TO_ZH.KR = "韩国";

export function countryZhNameFromCode(code: string | null | undefined): string | null {
  const c = normalizeAlpha2(code);
  if (!c) return null;
  return ALPHA2_TO_ZH[c] ?? c;
}
