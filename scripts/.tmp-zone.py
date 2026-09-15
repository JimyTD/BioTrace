import io, re

w = io.open('packages/messages/src/zh.ts', encoding='utf-8').read()

rows = []
for line in w.splitlines():
    m = re.match(r'^\s*"(me\.[a-zA-Z0-9_.]+)"\s*:\s*"(.*?)",?\s*$', line)
    if m:
        rows.append((m.group(1), m.group(2)))

print('me 条数:', len(rows))
print()
print('--- 仍带句号的 me 文案 ---')
n = 0
for k, v in rows:
    if v.rstrip().endswith(('。', '！', '？')):
        print('  %-38s %s' % (k, v))
        n += 1
print('  共', n, '条')
print()
print('--- 超 30 字的 me 文案 ---')
m2 = 0
for k, v in rows:
    if len(v) > 30:
        print('  %-38s (%d字) %s' % (k, len(v), v))
        m2 += 1
print('  共', m2, '条')
