#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 preview-*.html 的外链脚本内联成自包含页（headless 截图专用）。

为什么需要：Edge headless 对 file:// 的缓存按完整 URL 持久化，连 script src 上的
query 都可能被复用，截图会拿到旧 JS（改了半天"没生效"）。最稳的解法是构建一个
不依赖外部脚本的单文件页面。用法：
    python tools/build/inline-preview.py tools/preview-moonwalk.html out.html
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main(src, out):
    page = io.open(src, encoding='utf-8').read()
    tiger = io.open(os.path.join(ROOT, 'src/actors/tiger_renderer.js'), encoding='utf-8').read()
    pet = io.open(os.path.join(ROOT, 'js/ui/pet.js'), encoding='utf-8').read()
    head, tail = page.split('<!--MAIN-->', 1)
    # 去掉两行 document.write 外链，改内联
    head = head.split('<script>document.write')[0]
    body = (
        head
        + '<script>\n' + tiger + '\n</script>\n'
        + '<script>\n' + pet + '\n</script>\n'
        + '<script>' + tail.split('<script>', 1)[1]
    )
    out = os.path.abspath(out)
    if not os.path.isdir(os.path.dirname(out)):
        os.makedirs(os.path.dirname(out))
    io.open(out, 'w', encoding='utf-8').write(body)
    print('inlined ->', out, len(body), 'chars')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
