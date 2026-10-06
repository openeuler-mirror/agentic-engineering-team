#!/usr/bin/env python3
"""Python 源文件不能带 UTF-8 BOM。

`compile()` / `ast.parse()` 默认按 UTF-8 读取，文件开头的 U+FEFF 会被当成
非法字符：`SyntaxError: invalid non-printable character U+FEFF`。带 BOM 的
脚本在 Python 3 下根本跑不起来。

    python3 skills/wiki-builder/tests/test_no_bom.py
"""

import ast
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parents[1]      # skills/wiki-builder
ROOT = HERE.parents[1]                                   # 仓库根
BOM = b"\xef\xbb\xbf"


def main() -> int:
    if not ROOT.is_dir():
        print("FAIL  找不到仓库根目录：%s" % ROOT, file=sys.stderr)
        return 1

    fails = []
    scanned = 0
    for p in sorted(ROOT.rglob("*.py")):
        if ".git" in p.parts or "node_modules" in p.parts:
            continue
        scanned += 1
        if p.read_bytes().startswith(BOM):
            fails.append(("%s （文件以 UTF-8 BOM 开头）" % p.relative_to(ROOT), None))
            continue
        try:
            ast.parse(p.read_text(encoding="utf-8"))
        except SyntaxError as e:
            fails.append(("%s:%s" % (p.relative_to(ROOT), e.lineno), e.msg))

    if not scanned:
        print("FAIL  一个 .py 都没有扫到，检查没有真正执行", file=sys.stderr)
        return 1
    if fails:
        for where, why in fails:
            print("FAIL  %s%s" % (where, "" if why is None else " ⇒ " + why), file=sys.stderr)
        return 1
    print("全部通过（仓库内 .py 均无 BOM，且都能被 ast.parse 解析）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
