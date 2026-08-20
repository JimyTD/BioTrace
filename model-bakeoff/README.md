# 多模型识物对照测评

同图、同 Prompt，对多家视觉 API 跑一遍，结果落在 `results/`。

生产识图已不再用智谱 `glm-4v-flash`（现网是 Gemini → TokenHub 视觉链，见 [`docs/SPEC.md`](../docs/SPEC.md) §1.1）。本目录仍可对照测评任意视觉 API。

**地点与日期默认从图片 EXIF 读取**（GPS → 坐标；DateTimeOriginal → 日期）。  
有 GPS 时会再逆地理成可读地名（OpenStreetMap Nominatim，需外网）。  
对照模式仍会跑一遍「去掉地点」以测纠偏效果。

## 你需要准备的

### 1. 图片

放到 `images/` 即可（或聊天发给我）。**不必手填拍摄点/日期**——脚本会读 EXIF。

可选补充：

| 字段 | 是否必须 | 说明 |
|------|----------|------|
| 文件本身 | 必须 | jpg/png/webp（尽量保留原图 EXIF，勿经社交 App 重压） |
| 参考答案 `expected_hint` | 建议 | 如「大蚊科 / Tipula」，方便打分 |
| 手写覆盖 lat/place | 一般不需要 | 仅 EXIF 缺失或要纠错时 |

建议 5～8 张：难昆虫、难伪装鱼、鸟、植物、海外（若有）、可选模糊一张。

可先只检查 EXIF：

```powershell
python run_bakeoff.py --inspect-only
```

### 2. API Key（按优先级，有几个测几个）

| 提供方 | 要注册什么 | 注册/取 Key | 填到 `.env` |
|--------|------------|-------------|-------------|
| **Gemini** | Google AI Studio API Key | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| **智谱视觉 Flash** | 与 QQBotForFun 同一开放平台 Key | https://open.bigmodel.cn/ | `ZHIPU_API_KEY`（模型默认 `glm-4v-flash`） |
| **豆包 / 火山方舟** | 方舟 API Key + 视觉接入点 `ep-` | https://console.volcengine.com/ark | `ARK_API_KEY` + `DOUBAO_MODEL` |
| **通义 VL / 百炼** | 百炼 API Key | https://bailian.console.aliyun.com/ | `DASHSCOPE_API_KEY` |
| OpenAI / Claude | 可选 | 各自控制台 | 对应 Key |

密钥只放本机 `model-bakeoff/.env`，已加入 `.gitignore`，不要发到聊天里。

### 3. 豆包特别注意

方舟通常要先「创建推理接入点」，选带视觉的豆包模型，把 `ep-xxxxxxxx` 填进 `DOUBAO_MODEL`。

---

## 本地怎么跑

```powershell
cd D:\Fun\BioTrace\model-bakeoff
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env 填 Key；把图放进 images\
python run_bakeoff.py
```

```powershell
python run_bakeoff.py --providers gemini,doubao --sample crane-fly-jinggang
python run_bakeoff.py --no-geocode          # 只要坐标，不要逆地理地名
python run_bakeoff.py --modes with_place    # 只跑带地点
```

输出：`results/<时间戳>/summary.md`、`samples_enriched.json`（含 EXIF 解析结果）。

---

## 流程

1. 你发图（尽量带原始 EXIF）+ 可选参考答案  
2. 你注册并填好 `.env`  
3. 我跑测评，一起看 `summary.md` 拍板
