import io, re, collections

s = io.open('packages/messages/src/zh.ts', encoding='utf-8').read()

c = collections.Counter()      # 模块 -> 条数
multi = collections.Counter()  # 模块 -> 三段及以上 key 的条数
allkeys = []

for line in s.splitlines():
    m = re.match(r'\s*"([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)"\s*:', line)
    if not m:
        continue
    key = m.group(1)
    if '.' not in key:
        continue
    mod = key.split('.')[0]
    c[mod] += 1
    allkeys.append(key)
    if key.count('.') >= 2:
        multi[mod] += 1

total = sum(c.values())
print('模块                条数   其中多段')
print('-' * 38)
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    extra = ('  %d' % multi[k]) if multi[k] else '   -'
    print('%-18s %4d %s' % (k, v, extra))
print('-' * 38)
print('%-18s %4d   %d' % ('合计', total, sum(multi.values())))
