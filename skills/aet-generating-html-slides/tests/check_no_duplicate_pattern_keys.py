#!/usr/bin/env python3
"""判据：`validate_html.py` 的 `malformed_patterns` 必须自洽。

两条检查，都用 AST 读该字典字面量：

1. **不得有重复键** —— Python 里重复键不报错，后一个静默覆盖前一个，前一个成为死条目。
2. **键与值的 `>` 必须同形** —— 键不以 `>` 结尾（匹配前缀）时，替换值也不能带 `>`，
   否则原文里的 `>` 会留下来，产出 `<div>>` 这种畸形结果。

用法：
    python3 skills/aet-generating-html-slides/tests/check_no_duplicate_pattern_keys.py
"""

from __future__ import annotations

import ast
import collections
import pathlib
import sys

TARGET = pathlib.Path(__file__).resolve().parents[1] / "tools" / "validate_html.py"
DICT_NAME = "malformed_patterns"


def duplicate_keys(path: pathlib.Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[str] = []

    def visit(node: ast.AST) -> None:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == DICT_NAME for t in node.targets
        ):
            value = node.value
            if isinstance(value, ast.Dict):
                keys = [k.value for k in value.keys if isinstance(k, ast.Constant)]
                for key, count in collections.Counter(keys).items():
                    if count > 1:
                        found.append(f"{key!r} 出现 {count} 次")
        for child in ast.iter_child_nodes(node):
            visit(child)

    visit(tree)
    return found


def asymmetric_entries(path: pathlib.Path) -> list[str]:
    """键不以 '>' 结尾、值却以 '>' 结尾的条目 —— 原文里的 '>' 会被留下来。"""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[str] = []

    def visit(node: ast.AST) -> None:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == DICT_NAME for t in node.targets
        ):
            value = node.value
            if isinstance(value, ast.Dict):
                for k, v in zip(value.keys, value.values):
                    if (
                        isinstance(k, ast.Constant)
                        and isinstance(v, ast.Constant)
                        and isinstance(k.value, str)
                        and isinstance(v.value, str)
                        and not k.value.endswith(">")
                        and v.value.endswith(">")
                    ):
                        found.append(f"{k.value!r} => {v.value!r}")
        for child in ast.iter_child_nodes(node):
            visit(child)

    visit(tree)
    return found


def main() -> int:
    if not TARGET.is_file():
        print(f"FAIL: 找不到待检查的文件 {TARGET}")
        return 1
    failed = False
    dups = duplicate_keys(TARGET)
    if dups:
        failed = True
        print(f"FAIL: {TARGET.name} 的 {DICT_NAME} 有重复键：")
        for d in dups:
            print(f"  - {d}")
    bad = asymmetric_entries(TARGET)
    if bad:
        failed = True
        print(f"FAIL: {TARGET.name} 的 {DICT_NAME} 有键/值 '>' 不同形的条目（会产出双 '>'）：")
        for b in bad:
            print(f"  - {b}")
    if failed:
        return 1
    print(f"PASS: {TARGET.name} 的 {DICT_NAME} 无重复键、键/值 '>' 同形")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
