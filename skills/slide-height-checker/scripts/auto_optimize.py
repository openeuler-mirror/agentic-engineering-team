#!/usr/bin/env python3
"""
幻灯片生成后自动检测和优化脚本
集成到MVP工作流中，在生成幻灯片后自动调用检测

用法：python3 auto_optimize.py <html_file> [--fix]
"""

import re
import sys
import subprocess
from pathlib import Path

# 导入check_height模块
sys.path.insert(0, str(Path(__file__).parent))
from check_height import (
    analyze_html_file,
    get_optimization_suggestion,
    calculate_slide_height,
)


def optimize_css_params(content, optimization_type="increase"):
    """根据优化类型调整CSS参数"""

    if optimization_type == "increase":
        # 增加字体和间距（用于偏小页面）
        adjustments = {
            # 字体增加15%
            r"font-size: clamp\(22px, 2\.8vw, 32px\)": "font-size: clamp(26px, 3.2vw, 38px)",
            r"font-size: clamp\(18px, 2vw, 24px\)": "font-size: clamp(22px, 2.4vw, 28px)",
            r"font-size: clamp\(16px, 1\.8vw, 20px\)": "font-size: clamp(18px, 2vw, 24px)",
            r"font-size: clamp\(13px, 1\.3vw, 16px\)": "font-size: clamp(15px, 1.5vw, 18px)",
            r"font-size: clamp\(11px, 1\.1vw, 13px\)": "font-size: clamp(13px, 1.3vw, 16px)",
            # 间距增加20%
            r"padding: clamp\(20px, 3vw, 40px\)": "padding: clamp(25px, 3.5vw, 50px)",
            r"gap: clamp\(8px, 1vw, 15px\)": "gap: clamp(12px, 1.5vw, 20px)",
            # 卡片padding增加
            r"padding: clamp\(10px, 1\.5vw, 15px\)": "padding: clamp(14px, 1.8vw, 22px)",
            r"padding: clamp\(8px, 1vw, 12px\)": "padding: clamp(12px, 1.5vw, 18px)",
        }
    else:
        # 减小字体和间距（用于超高页面 - 谨慎使用）
        adjustments = {
            r"font-size: clamp\(22px, 2\.8vw, 32px\)": "font-size: clamp(20px, 2.5vw, 28px)",
            r"font-size: clamp\(18px, 2vw, 24px\)": "font-size: clamp(16px, 1.8vw, 22px)",
            r"gap: clamp\(8px, 1vw, 15px\)": "gap: clamp(6px, 0.8vw, 12px)",
        }

    for pattern, replacement in adjustments.items():
        content = re.sub(pattern, replacement, content)

    return content


def suggest_split_pages(html_path):
    """分析超高页面并提供拆分建议"""

    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    slides = re.findall(r'<div class="slide[^"]*"[^>]*data-slide="(\d+)"', content)

    suggestions = []

    for slide_num in slides:
        start_idx = content.find(f'data-slide="{slide_num}"')
        next_idx = content.find(f'data-slide="{int(slide_num) + 1}"', start_idx)

        if next_idx > 0:
            slide_content = content[start_idx:next_idx]
        else:
            slide_content = content[start_idx:]

        height, elements = calculate_slide_height(slide_content)

        if height > 1080:
            overflow_pct = (height - 1080) / 1080 * 100

            # 根据内容类型提供拆分建议
            if elements["cards"] >= 4:
                suggestions.append(
                    {
                        "slide": slide_num,
                        "height": height,
                        "overflow": overflow_pct,
                        "action": "拆分为2页：前2个cards + 后2个cards",
                    }
                )
            elif elements["sb"] >= 4:
                suggestions.append(
                    {
                        "slide": slide_num,
                        "height": height,
                        "overflow": overflow_pct,
                        "action": "拆分step_blocks为多页",
                    }
                )
            elif elements["tr"] >= 8:
                suggestions.append(
                    {
                        "slide": slide_num,
                        "height": height,
                        "overflow": overflow_pct,
                        "action": "拆分表格为2页",
                    }
                )
            elif elements["p"] >= 10:
                suggestions.append(
                    {
                        "slide": slide_num,
                        "height": height,
                        "overflow": overflow_pct,
                        "action": "精简段落内容",
                    }
                )
            else:
                suggestions.append(
                    {
                        "slide": slide_num,
                        "height": height,
                        "overflow": overflow_pct,
                        "action": f"拆分为{(height // 1080) + 1}页",
                    }
                )

    return suggestions


def auto_optimize(html_path, fix=False):
    """自动检测和优化幻灯片"""

    print("=" * 80)
    print("幻灯片自动检测和优化")
    print("=" * 80)

    # 运行检测
    overflow_pages, underflow_pages = analyze_html_file(html_path)

    if not overflow_pages and not underflow_pages:
        print("\n✅ 所有页面高度正常，无需优化！")
        return True

    # 处理超高页面
    if overflow_pages:
        print("\n" + "=" * 80)
        print(f"🔴 发现{len(overflow_pages)}个超高页面")
        print("=" * 80)

        suggestions = suggest_split_pages(html_path)

        for sug in suggestions:
            print(
                f"\n第{sug['slide']}页: {sug['height']}px (超出{sug['overflow']:.1f}%)"
            )
            print(f"  建议: {sug['action']}")

        if fix:
            print("\n💡 提示: 超高页面建议手动拆分，脚本无法自动拆分内容")
            print("   请根据上述建议手动调整幻灯片结构")

        return False

    # 处理偏小页面
    if underflow_pages and fix:
        print("\n" + "=" * 80)
        print(f"🔷 发现{len(underflow_pages)}个偏小页面，正在自动优化...")
        print("=" * 80)

        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 应用CSS优化
        optimized_content = optimize_css_params(content, "increase")

        # 保存优化后的文件
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(optimized_content)

        print("\n✅ CSS参数已优化（增加15%-20%）")

        # 重新检测
        print("\n重新检测...")
        overflow_pages, underflow_pages = analyze_html_file(html_path)

        if not overflow_pages:
            print("\n✅ 优化完成！")
            return True
        else:
            print("\n⚠️ 优化后仍有超高页面，需要手动拆分")
            return False

    return False


def main():
    if len(sys.argv) < 2:
        print("用法: python3 auto_optimize.py <html_file> [--fix]")
        print("  --fix: 自动修复偏小页面的CSS参数")
        sys.exit(1)

    html_path = Path(sys.argv[1])
    fix = "--fix" in sys.argv

    if not html_path.exists():
        print(f"错误: 文件不存在 {html_path}")
        sys.exit(1)

    success = auto_optimize(html_path, fix)

    if success:
        print("\n" + "=" * 80)
        print("✅ 幻灯片高度检测通过，可以交付！")
        print("=" * 80)
        sys.exit(0)
    else:
        print("\n" + "=" * 80)
        print("⚠️ 幻灯片存在高度问题，请手动修复后重新检测")
        print("=" * 80)
        sys.exit(1)


if __name__ == "__main__":
    main()
