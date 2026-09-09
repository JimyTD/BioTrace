# 品种对照表

> 库只纠偏：把已知写法收到同一格。不在库里的名字不去鉴定是不是真品种。

## 文件

| 文件 | 物种键 | 来源 |
|------|--------|------|
| `dog.json` | `Canis lupus` | 原表 + [Wikidata dog breed Q39367](https://www.wikidata.org/wiki/Q39367) |
| `cat.json` | `Felis catus` | 原表 + [Wikidata cat breed Q43577](https://www.wikidata.org/wiki/Q43577) |
| `chicken.json` | `Gallus gallus` | 原表 + Wikidata chicken breed Q15304943 + 国家级畜禽遗传资源保护名录（鸡，摘录常见） |
| `cow.json` | `Bos taurus`（兼 `Bos indicus`） | Wikidata cattle breed Q12045585 + 保护名录（牛，摘录常见）+ 荷斯坦等引入种 |
| `horse.json` | `Equus caballus` | Wikidata horse breed Q1160573 |
| `discard.json` | — | 「品种不详」排除词 |

`listed` / `prevalence` 不参与展示：曾经给卡上品种格用，已废弃。对照表只做纠偏，名字写在该次观察上。

更新 Wikidata 合并：`python scripts/import-breed-wikidata.py`（可重复跑，保留已有 id / 别名）。
