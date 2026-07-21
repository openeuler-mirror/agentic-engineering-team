---
name: slide-height-checker
description: 检测HTML幻灯片的实际渲染高度，识别超高页面，提供字体大小和间距优化建议。用于确保幻灯片每页在100vh内完整可读，不依赖整页纵向滚动。触发条件：生成HTML幻灯片后检查高度、幻灯片内容溢出、需要优化字体/间距、检测页面超高问题、调整幻灯片布局密度。
---

# Slide Height Checker

检测和优化HTML幻灯片的渲染高度，确保每页在100vh内完整可读。

## 核心功能

1. **高度检测**：计算每页幻灯片的实际渲染高度（基于CSS clamp参数中间值）
2. **超高识别**：标记超过100vh（1080px @1920x1080）的页面
3. **偏小识别**：标记低于70vh（756px）的页面，提供增加字体/间距建议
4. **优化建议**：根据剩余空间推荐字体大小和间距调整
5. **修复方案**：提供拆分页面或调整CSS参数的具体方案

## 快速使用

```bash
# 检测幻灯片高度
python3 scripts/check_height.py <html_file>

# 输出示例：
# 第5页: 🔴 超高 | 1320px/1080px (超出22.2%)
# 建议：拆分为2页，或减少表格行数
```

## 高度计算规则

详见 [references/css_rules.md](references/css_rules.md)

### 100vh基准

1920x1080分辨率下，100vh = 1080px

### 高度判定标准

| 状态 | 高度范围 | 颜色标识 | 处理建议 |
|------|----------|----------|----------|
| 超高 | > 1080px (100vh) | 🔴 | 必须拆分或精简 |
| 较高 | > 918px (85vh) | 🟡 | 关注动态内容预留 |
| 正常 | 756-918px (70-85vh) | ✅ | 安全范围 |
| 偏小 | < 756px (70vh) | 🔷 | 可增加字体/间距 |

## 优化策略

### 高度过高（超出100vh）

**方案一：拆分页面**（推荐）

将超高页面拆成2-3页，保持每页≤1080px

**方案二：精简内容**

- 减少表格行数（合并相关行）
- 减少card数量（改用紧凑布局）
- 减少step_blocks（简化步骤描述）
- 删除重复段落

**方案三：调整CSS**（谨慎）

- 缩小clamp最大值（如h1: clamp(22px, 2.8vw, 28px)）
- 减少gap值
- 减少padding值

### 高度过小（低于70vh）

当页面高度 < 756px（70vh）时，可适当增加字体或间距：

**字体优化（增加10%-20%）**

```css
/* 原值 */
h1 { font-size: clamp(22px, 2.8vw, 32px); }
/* 优化后（+15%） */
h1 { font-size: clamp(24px, 3vw, 36px); }

/* 原值 */
p { font-size: clamp(13px, 1.3vw, 16px); }
/* 优化后（+15%） */
p { font-size: clamp(15px, 1.5vw, 18px); }
```

**间距优化（增加gap）**

```css
/* 原值 */
.slide-content { gap: clamp(8px, 1vw, 15px); }
/* 优化后（+20%） */
.slide-content { gap: clamp(12px, 1.5vw, 20px); }
```

### 优化平衡原则

- **保持一致性**：全局参数调整需同步修改所有页面
- **优先拆分**：拆分页面优于调整CSS（避免影响其他页面）
- **最小改动**：每次调整不超过15%，避免破坏整体布局
- **测试验证**：调整后必须重新检测所有页面高度

## 自动化集成

在MVP工作流中，prototype-builder生成幻灯片后应自动调用此检测：

### 使用check_height.py检测

```bash
# 在生成幻灯片后自动检测
python3 scripts/check_height.py projects/<project>/innovation-report-slides.html
```

### 使用auto_optimize.py自动优化

```bash
# 仅检测
python3 scripts/auto_optimize.py <html_file>

# 自动优化偏小页面（增加字体和间距）
python3 scripts/auto_optimize.py <html_file> --fix
```

auto_optimize.py功能：
- 自动检测所有页面高度
- 对偏小页面自动调整CSS参数（增加15%-20%）
- 对超高页面提供拆分建议（需手动拆分）
- 迭代检测直到所有页面通过

### 工作流集成

在aet-generating-html-slides skill生成幻灯片后，自动调用：

```bash
# Step 4后自动执行
python3 skills/slide-height-checker/scripts/auto_optimize.py slides.html --fix

# 验证结果
# - 无超高页面：交付
# - 有超高页面：手动拆分后重新检测
```

如果检测到超高页面，应：
1. 优先拆分超高页面
2. 重新生成幻灯片
3. 再次检测验证

如果检测到偏小页面，应：
1. 运行 `--fix` 参数自动调整CSS
2. 或根据建议手动调整
3. 再次检测验证

## 常见问题处理

### Mermaid架构图高度不可控

建议用CSS架构层替代Mermaid图：

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

### 多表格页面优化

- 合并相似行
- 减少列数（删除次要信息）
- 使用紧凑表格样式

## 最佳实践

1. **生成后立即检测**：每生成一批幻灯片后运行检测
2. **先拆分后优化**：优先拆分超高页面，CSS调整作为最后手段
3. **保持全局一致性**：参数调整需同步修改所有相关元素
4. **边界预留**：保持每页≤85vh（约918px），为动态内容预留空间
5. **文档化调整**：记录每次CSS调整的原因和效果