import re, collections

zh = open('packages/messages/src/zh.ts', encoding='utf-8').read()

rows = collections.defaultdict(list)
for line in zh.splitlines():
    m = re.match(r'^\s*"([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)"\s*:\s*"(.*?)",?\s*$', line)
    if m:
        rows[m.group(1).split('.')[0]].append((m.group(1), m.group(2)))

# 本轮（2026-09-09 起）逐条审过的模块
REVIEWED_DETAIL = ['auth', 'error', 'trips', 'rank', 'volume', 'me']

for mod in REVIEWED_DETAIL:
    rs = rows.get(mod, [])
    dot = [(k, v) for k, v in rs if v.rstrip().endswith(('。', '！', '？'))]
    long = [(k, v) for k, v in rs if len(v) > 30]
    print('[%s] 共 %d 条' % (mod, len(rs)))
    print('  带句号 %d 条:' % len(dot))
    for k, v in dot:
        print('    %-34s %s' % (k, v))
    print('  超30字 %d 条:' % len(long))
    for k, v in long:
        print('    %-34s (%d) %s' % (k, len(v), v))
    print()
