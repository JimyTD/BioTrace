import io, re, collections

w = io.open('packages/messages/src/zh.ts', encoding='utf-8').read()
ks = [m.group(1) for m in
      re.finditer(r'\s*"([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)"\s*:', w)]

a = [k for k in ks if k.startswith('admin.')]
print('admin 总条数:', len(a))
print()
print('admin 二级分类:')
c = collections.Counter('.'.join(k.split('.')[:2]) for k in a)
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    print('  %-24s %4d' % (k, v))

print()
print('新增发现模块的 key 全表:')
for mod in ('tree3d', 'identify', 'listTag'):
    print()
    print('  [%s]' % mod)
    for k in ks:
        if k.startswith(mod + '.'):
            line = [l.strip() for l in w.splitlines() if l.strip().startswith('"%s"' % k)]
            val = line[0].split(':', 1)[1].strip().rstrip(',').strip('"') if line else ''
            print('    %-40s %s' % (k, val))
