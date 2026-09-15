import io

p = r"docs/features/文案分区.md"
s = io.open(p, encoding="utf-8").read()

old = "品牌 `app.tagline`；nav 四词；登录引导 `auth.lede`（`auth.registerLede`\n2026-09-07 降固定区）；旅途 `trips.title/lede/empty`；"
new = "品牌 `app.tagline` 与 `app.lede`；nav 四词；旅途 `trips.title/lede/empty`；"

assert old in s, "未找到目标片段"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
