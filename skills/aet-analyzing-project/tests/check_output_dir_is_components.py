#!/usr/bin/env python3
"""组件分析的产物目录必须叫 components/。

Phase 2 的规定写在 `references/phase2-component-analysis.md`：
`Output File: {output-directory}/components/{ModuleID}-{ModuleName}.md`。
但 `assets/*.md` 里的示例链接写成了 `modules/...`，于是按模板产出时目录名与规定不一致
（见仓库 issue #31）。

判据扫描该 skill 的 `references/` 与 `assets/` 下所有 Markdown，找出形如
`<某目录>/xxx.md` 的路径引用：出现 `modules/` 一律失败；同时要求 `components/` 至少出现一次，
否则说明扫描没有真正覆盖到目标文件。

    python3 skills/aet-analyzing-project/tests/check_output_dir_is_components.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parents[1]
BAD = re.compile(r'\bmodules/')
GOOD = re.compile(r'\bcomponents/')
TEXT_SUFFIXES = (".md", ".markdown")


def main() -> int:
    files = sorted(p for d in ("references", "assets") for p in (HERE / d).rglob("*")
                   if p.is_file() and p.suffix.lower() in TEXT_SUFFIXES)
    if not files:
        print("FAIL  没有找到待检查的 Markdown 文件（%s）" % HERE, file=sys.stderr)
        return 1
    hits, good = [], 0
    for p in files:
        text = p.read_text(encoding="utf-8", errors="replace")
        good += len(GOOD.findall(text))
        for i, line in enumerate(text.split("\n"), 1):
            if BAD.search(line):
                hits.append((p.relative_to(HERE), i, line.strip()[:90]))
    if good == 0:
        print("FAIL  components/ 一次都没出现，判据没有覆盖到目标", file=sys.stderr)
        return 1
    if hits:
        for rel, ln, line in hits:
            print("FAIL  %s:%s ⇒ 引用了 modules/ 目录：%s" % (rel, ln, line), file=sys.stderr)
        return 1
    print("全部通过（扫了 %d 个 Markdown，components/ 出现 %d 次，未发现 modules/ 目录引用）"
          % (len(files), good))
    return 0


if __name__ == "__main__":
    sys.exit(main())
