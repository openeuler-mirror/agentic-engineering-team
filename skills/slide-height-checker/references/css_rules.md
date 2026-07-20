# CSS参数计算规则

幻灯片高度检测的CSS参数计算规则和优化参数表。

## clamp函数中间值计算

clamp函数格式：`clamp(min, preferred, max)`

中间值计算公式：`(min + max) / 2`

示例：
```css
clamp(20px, 3vw, 40px)
中间值 = (20 + 40) / 2 = 30px
```

## 基准分辨率

1920x1080分辨率下：
- 100vh = 1080px
- 1vw = 19.2px

## 参数计算表

### 基础元素

| 元素 | CSS clamp | 中间值 | 计算公式 |
|------|-----------|--------|----------|
| padding | clamp(20px, 3vw, 40px) | 30px | (20+40)/2 |
| gap | clamp(8px, 1vw, 15px) | 11.5px | (8+15)/2 |
| h1 | clamp(22px, 2.8vw, 32px) + margin | 48px | font+margin+border+padding |
| h2 | clamp(18px, 2vw, 24px) + margin | 37px | font+margin_top+margin_bottom |
| h3 | clamp(16px, 1.8vw, 20px) + margin | 31px | font+margin_top+margin_bottom |
| p | clamp(13px, 1.3vw, 16px) | 22px | font + line-height |

### 表格元素

| 元素 | 计算公式 | 中间值 |
|------|----------|--------|
| font | clamp(11px, 1.1vw, 13px) | 12px |
| padding | clamp(6px, 0.8vw, 10px) | 8px |
| 行高 | font × 1.5 + padding × 2 | 34px |

### 复合元素

| 元素 | 计算公式 | 中间值 |
|------|----------|--------|
| step_block | padding×2 + title(14px) + 6 + content×2.8 | 73px |
| card | padding×2 + border(4) + content(65) | 94px |
| effect_box | 固定值 | 60px |
| arch_layer | 固定值 | 45px |
| forensics | 固定值 | 70px |

### 固定元素

| 元素 | 高度 |
|------|------|
| li | 28px |
| controls（导航栏） | 50px |

## 高度计算公式

```python
height = padding × 2  # 上下padding
height += gap × (元素数 - 1)  # gap累积
height += h1_total × h1_count
height += h2_total × h2_count
height += h3_total × h3_count
height += table_row × tr_count
height += step_block × sb_count
height += card × card_count
height += effect_box × eb_count
height += arch_layer × al_count
height += forensics × fi_count
height += li × li_count
height += p × p_count
height += controls  # 底部导航栏
```

## 优化参数调整范围

### 字体大小优化（高度偏小时）

| 元素 | 原值 | 优化值（+10%） | 优化值（+20%） |
|------|------|---------------|---------------|
| h1 | clamp(22px, 2.8vw, 32px) | clamp(24px, 3vw, 35px) | clamp(26px, 3.3vw, 38px) |
| h2 | clamp(18px, 2vw, 24px) | clamp(20px, 2.2vw, 26px) | clamp(22px, 2.4vw, 29px) |
| h3 | clamp(16px, 1.8vw, 20px) | clamp(17px, 1.9vw, 22px) | clamp(19px, 2.1vw, 24px) |
| p | clamp(13px, 1.3vw, 16px) | clamp(14px, 1.4vw, 17px) | clamp(15px, 1.5vw, 19px) |

### 间距优化（高度偏小时）

| 元素 | 原值 | 优化值（+10%） | 优化值（+20%） |
|------|------|---------------|---------------|
| gap | clamp(8px, 1vw, 15px) | clamp(9px, 1.1vw, 17px) | clamp(10px, 1.2vw, 18px) |
| padding | clamp(20px, 3vw, 40px) | clamp(22px, 3.3vw, 44px) | clamp(24px, 3.6vw, 48px) |

### 精简优化（高度超高时）

| 操作 | 效果 | 适用场景 |
|------|------|----------|
| 减少2行表格行 | -68px | tr > 6 |
| 减少1个card | -94px | cards > 3 |
| 减少2个step_blocks | -146px | sb > 4 |
| 减少3个effect_boxes | -180px | eb > 6 |
| 减少5个paragraphs | -110px | p > 10 |

## 高度判定标准

| 状态 | 高度范围 | 颜色标识 | 处理建议 |
|------|----------|----------|----------|
| 超高 | > 1080px (100vh) | 🔴 | 必须拆分或精简 |
| 较高 | > 918px (85vh) | 🟡 | 关注动态内容预留 |
| 正常 | ≤ 918px, ≥ 756px | ✅ | 安全范围 |
| 偏小 | < 756px (70vh) | 🔷 | 可增加字体/间距 |

## Mermaid图替代方案

Mermaid图高度不可控，建议用CSS架构层替代：

```html
<div class="architecture-layer">
    <div class="architecture-title">架构层名称</div>
    <div class="architecture-components">
        <div class="component">组件1</div>
        <div class="component component-brain">Brain组件</div>
        <div class="component component-worker">Worker组件</div>
    </div>
</div>
```

CSS定义：
```css
.architecture-layer {
    padding: 10px 15px;
    margin: 8px 0;
    border-radius: 5px;
    border-left: 3px solid var(--primary);
}

.component {
    padding: 5px 8px;
    border-radius: 3px;
    border: 1px solid var(--border);
}

.component-brain {
    background: var(--primary);
    color: white;
}

.component-worker {
    background: var(--success);
    color: white;
}
```

## 响应式注意事项

- clamp在不同分辨率下会自适应
- 1920px宽度：接近中间值
- 更大屏幕：接近最大值
- 更小屏幕：接近最小值

检测脚本使用中间值作为1920x1080分辨率下的典型值估算。