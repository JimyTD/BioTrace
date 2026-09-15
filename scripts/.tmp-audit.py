import re, os

src = open(r"packages/messages/src/zh.ts", encoding="utf-8").read()
keys = re.findall(r'"(auth\.[a-zA-Z0-9]+)":', src)

roots = [r"apps/web/src", r"apps/api/src", r"packages", r"scripts"]
files = []
for root in roots:
    for dirpath, _, names in os.walk(root):
        if "node_modules" in dirpath or ".git" in dirpath:
            continue
        for n in names:
            if n.endswith((".ts", ".tsx", ".js", ".mjs", ".py", ".html")):
                files.append(os.path.join(dirpath, n))

blob = "\n".join(
    open(f, encoding="utf-8", errors="replace").read() for f in files
)

print("=== auth.* 全仓引用数")
for k in sorted(set(keys)):
    n = len(re.findall(r'["\']' + re.escape(k) + r'["\']', blob))
    flag = "  <== 死 key" if n == 0 else ""
    print(f"  {k:34} {n}{flag}")
