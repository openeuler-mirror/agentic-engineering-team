#!/usr/bin/env python3
"""
幻灯片高度检测脚本
检测HTML幻灯片的实际渲染高度，识别超高页面，提供优化建议

用法：python3 check_height.py <html_file>

注意：使用clamp最大值计算，因为在1920px宽度下clamp通常接近max值
"""

import re
import sys
from pathlib import Path


# CSS参数最大值（基于clamp函数，1920px宽度下通常接近max）
def clamp_max(clamp_str):
    """提取clamp(min, preferred, max)的最大值（实际渲染上限）"""
    match = re.search(r"clamp\((\d+)px,\s*[\d.]+vw,\s*(\d+)px\)", clamp_str)
    if match:
        return int(match.group(2))  # 返回max值
    return 0


# 关键参数计算（使用max值，1920x1080分辨率）
PARAMS = {
    "padding_content": clamp_max("clamp(25px, 3.5vw, 50px)"),
    "gap_content": clamp_max("clamp(12px, 1.5vw, 20px)"),
    # 标题高度（font + margin + padding/border）
    "h1_total": clamp_max("clamp(26px, 3.2vw, 38px)")
    + clamp_max("clamp(12px, 1.2vw, 18px)")
    + 3
    + clamp_max("clamp(8px, 1vw, 14px)"),
    "h2_total": clamp_max("clamp(22px, 2.4vw, 28px)")
    + clamp_max("clamp(12px, 1.2vw, 18px)")
    + clamp_max("clamp(8px, 1vw, 12px)"),
    "h3_total": clamp_max("clamp(22px, 2.4vw, 28px)")
    + clamp_max("clamp(10px, 1vw, 15px)")
    + clamp_max("clamp(6px, 0.8vw, 10px)"),
    # 表格行高度
    "table_font": clamp_max("clamp(13px, 1.3vw, 16px)"),
    "table_padding": clamp_max("clamp(8px, 1vw, 14px)"),
    "table_row_height": lambda: (
        PARAMS["table_font"] * 1.6 + PARAMS["table_padding"] * 2
    ),
    # 复合元素
    "step_block_padding": clamp_max("clamp(8px, 1vw, 12px)"),
    "step_block_title": clamp_max("clamp(12px, 1.2vw, 14px)"),
    "step_block_content": clamp_max("clamp(13px, 1.3vw, 16px)"),
    "step_block_height": lambda: (
        PARAMS["step_block_padding"] * 2
        + PARAMS["step_block_title"]
        + 6
        + PARAMS["step_block_content"] * 3
    ),
    "card_padding": clamp_max("clamp(14px, 1.8vw, 22px)"),
    "card_border": 4,
    "card_content": 80,
    "card_height": lambda: (
        PARAMS["card_padding"] * 2 + PARAMS["card_border"] + PARAMS["card_content"]
    ),
    # 固定高度元素
    "effect_box_height": 70,
    "arch_layer_height": 55,
    "forensics_height": 85,
    "li_height": 35,
    "p_height": 28,
    "controls_height": 50,  # 底部导航栏
    # 100vh基准
    "vh_1080": 1080,  # 1920x1080分辨率下的100vh
}


def calculate_slide_height(slide_content):
    """计算单个幻灯片的实际渲染高度"""

    # 统计元素数量
    h1_count = len(re.findall(r"<h1[^>]*>", slide_content))
    h2_count = len(re.findall(r"<h2[^>]*>", slide_content))
    h3_count = len(re.findall(r"<h3[^>]*>", slide_content))
    tr_count = len(re.findall(r"<tr>", slide_content))

    sb_count = len(re.findall(r'class="step-block"', slide_content))
    ic_count = len(re.findall(r'class="innovation-card"', slide_content))
    pc_count = len(re.findall(r'class="pain-card"', slide_content))
    sc_count = len(re.findall(r'class="success-card"', slide_content))
    total_cards = ic_count + pc_count + sc_count

    eb_count = len(re.findall(r'class="effect-box"', slide_content))
    al_count = len(re.findall(r'class="architecture-layer"', slide_content))
    fi_count = len(re.findall(r'class="forensics-item"', slide_content))
    li_count = len(re.findall(r"<li[^>]*>", slide_content))
    p_count = len(re.findall(r"<p[^>]*>", slide_content))

    # 计算实际高度
    height = PARAMS["padding_content"] * 2  # 上下padding

    # gap累积（主要元素之间）
    gap_count = max(0, h1_count + h2_count + tr_count // 2 + sb_count + total_cards - 1)
    height += PARAMS["gap_content"] * gap_count

    # 各元素高度
    height += PARAMS["h1_total"] * h1_count
    height += PARAMS["h2_total"] * h2_count
    height += PARAMS["h3_total"] * h3_count
    height += PARAMS["table_row_height"]() * tr_count
    height += PARAMS["step_block_height"]() * sb_count
    height += PARAMS["card_height"]() * total_cards
    height += PARAMS["effect_box_height"] * eb_count
    height += PARAMS["arch_layer_height"] * al_count
    height += PARAMS["forensics_height"] * fi_count
    height += PARAMS["li_height"] * li_count
    height += PARAMS["p_height"] * p_count
    height += PARAMS["controls_height"]  # 底部控制栏

    return height, {
        "h1": h1_count,
        "h2": h2_count,
        "h3": h3_count,
        "tr": tr_count,
        "sb": sb_count,
        "cards": total_cards,
        "eb": eb_count,
        "al": al_count,
        "fi": fi_count,
        "li": li_count,
        "p": p_count,
    }


def get_optimization_suggestion(height, elements, vh=1080):
    """根据高度和元素分布提供优化建议"""

    overflow_pct = (height - vh) / vh * 100 if height > vh else 0
    suggestions = []

    if height > vh:
        # 超高页面优化建议
        if elements["tr"] > 6:
            suggestions.append("减少表格行数，合并相似行")
        if elements["cards"] > 3:
            suggestions.append("减少卡片数量，改用紧凑布局")
        if elements["sb"] > 4:
            suggestions.append("拆分step_blocks为多页")
        if elements["eb"] > 6:
            suggestions.append("将effect_boxes改为architecture-layer布局")
        if elements["p"] > 10:
            suggestions.append("精简段落内容，删除重复描述")

        if not suggestions:
            suggestions.append(f"拆分为{(height // vh) + 1}页")

        return "超高", suggestions, overflow_pct

    elif height > vh * 0.85:
        return "较高", ["接近边界，关注动态内容预留空间"], 0

    elif height < vh * 0.70:
        # 偏小页面优化建议
        underflow_pct = (vh * 0.70 - height) / vh * 100
        suggestions = []

        if height < vh * 0.50:
            suggestions.append("增加字体大小15%-20%")
            suggestions.append("增加gap间距20%")
        elif height < vh * 0.70:
            suggestions.append("增加字体大小10%")
            suggestions.append("增加卡片间距10%")

        return "偏小", suggestions, -underflow_pct

    else:
        return "正常", [], 0


def analyze_html_file(html_path):
    """分析HTML幻灯片文件"""

    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 提取所有幻灯片（支持整数和小数编号如4.5）
    slide_pattern = r'<div class="slide[^"]*"[^>]*data-slide="([\d.]+)"'
    slides = re.findall(slide_pattern, content)

    # 按数字值排序
    slides = sorted(slides, key=lambda x: float(x))

    print("=" * 80)
    print(f"CSS参数中间值（1920x1080分辨率）")
    print("=" * 80)
    print(
        f"padding={PARAMS['padding_content']:.1f}px, gap={PARAMS['gap_content']:.1f}px"
    )
    print(
        f"h1={PARAMS['h1_total']:.1f}px, h2={PARAMS['h2_total']:.1f}px, h3={PARAMS['h3_total']:.1f}px"
    )
    print(
        f"table_row={PARAMS['table_row_height']():.1f}px, step_block={PARAMS['step_block_height']():.1f}px"
    )
    print(f"card={PARAMS['card_height']():.1f}px")
    print(f"100vh基准={PARAMS['vh_1080']}px")

    print("\n" + "=" * 80)
    print("各页面实际高度统计")
    print("=" * 80)

    overflow_pages = []
    underflow_pages = []

    for i, slide_num in enumerate(slides):
        # 找到幻灯片内容范围
        start_idx = content.find(f'data-slide="{slide_num}"')

        # 基于索引找下一个slide
        if i + 1 < len(slides):
            next_slide = slides[i + 1]
            next_idx = content.find(f'data-slide="{next_slide}"', start_idx)
        else:
            next_idx = -1

        if next_idx > 0:
            slide_content = content[start_idx:next_idx]
        else:
            slide_content = content[start_idx:]

        # 计算高度
        height, elements = calculate_slide_height(slide_content)

        # 获取优化建议
        status, suggestions, pct = get_optimization_suggestion(height, elements)

        # 输出结果
        overflow_pct = (
            (height - PARAMS["vh_1080"]) / PARAMS["vh_1080"] * 100
            if height > PARAMS["vh_1080"]
            else 0
        )

        if height > PARAMS["vh_1080"]:
            status_icon = "🔴"
            overflow_pages.append((slide_num, height, overflow_pct, suggestions))
        elif height > PARAMS["vh_1080"] * 0.85:
            status_icon = "🟡"
        elif height < PARAMS["vh_1080"] * 0.70:
            status_icon = "🔷"
            underflow_pages.append((slide_num, height, -pct, suggestions))
        else:
            status_icon = "✅"

        print(
            f"\n第{slide_num}页: {status_icon} {status} | 高度={height:.0f}px/{PARAMS['vh_1080']}px"
        )
        if height > PARAMS["vh_1080"] * 0.80 or height < PARAMS["vh_1080"] * 0.70:
            print(
                f"  元素: h1={elements['h1']}, h2={elements['h2']}, h3={elements['h3']}, tr={elements['tr']}"
            )
            print(
                f"        cards={elements['cards']}, sb={elements['sb']}, effects={elements['eb']}, p={elements['p']}"
            )

        if suggestions:
            print(f"  建议: {', '.join(suggestions[:2])}")

    # 输出汇总
    print("\n" + "=" * 80)
    if overflow_pages:
        print(f"超高页面汇总（共{len(overflow_pages)}页需修复）")
        print("=" * 80)
        for sn, h, pct, sug in overflow_pages:
            print(f"  第{sn}页: {h:.0f}px (超出{pct:.1f}%)")
            print(f"    建议: {sug[0]}")
    elif underflow_pages:
        print(f"偏小页面汇总（共{len(underflow_pages)}页可优化）")
        print("=" * 80)
        for sn, h, pct, sug in underflow_pages:
            print(f"  第{sn}页: {h:.0f}px (低于{pct:.1f}%)")
            print(f"    建议: {sug[0]}")
    else:
        print("✅ 所有页面高度正常，无超高/偏小页面！")
    print("=" * 80)

    return overflow_pages, underflow_pages


def main():
    if len(sys.argv) < 2:
        print("用法: python3 check_height.py <html_file>")
        sys.exit(1)

    html_path = Path(sys.argv[1])
    if not html_path.exists():
        print(f"错误: 文件不存在 {html_path}")
        sys.exit(1)

    analyze_html_file(html_path)


if __name__ == "__main__":
    main()
