import re, collections

src = open(r"packages/messages/src/zh.ts", encoding="utf-8").read()
c = collections.Counter(
    re.findall(r'"([a-zA-Z][a-zA-Z0-9]*)\.[a-zA-Z0-9]+":', src)
)
for k, v in c.most_common():
    print(f"{k:16}{v}")
