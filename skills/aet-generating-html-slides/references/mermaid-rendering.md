# Mermaid Architecture Diagram Rendering Guide

本文档提供 HTML 幻灯片中 Mermaid 架构图渲染的完整知识体系。

## 何时读取本文档

触发条件：
- 幻灯片需要架构图、流程图、时序图等可视化内容
- 需要在多页幻灯片中嵌入 Mermaid 图表
- 图表渲染出现问题（尺寸错误、显示异常、不居中等）

---

## 一、Mermaid 11.x 版本关键变化

| 版本变化 | 影响 | 解决方案 |
|---------|------|---------|
| 推荐使用 `flowchart` | `graph TB` 仍可用，但 `flowchart TB` 是官方推荐 | 使用 `flowchart TB` |
| 隐藏元素渲染问题 | `display: none` 元素中渲染时 SVG 尺寸计算错误 | 延迟渲染策略 |
| 中文节点标签 | Mermaid 11.x 自动支持中文节点名 | 使用 `[中文节点名]` 语法 |

---

## 二、核心问题：隐藏元素渲染

### 问题表现

```html
<!-- 错误示例：在隐藏元素中初始化渲染 -->
<div class="slide" style="display: none;">
    <div class="mermaid">
        flowchart TB
        A --> B
    </div>
</div>
<!-- 结果：SVG viewBox="-8 -8 16 16"，尺寸错误为 16x16 -->
```

### 根本原因

- Mermaid 渲染时需要计算节点布局尺寸
- `display: none` 元素无法获取真实的渲染尺寸
- 导致 SVG viewBox 计算为最小值（16x16）

### 解决方案：延迟渲染策略

```javascript
// ❌ 错误方式：页面加载时全部渲染
mermaid.initialize({ startOnLoad: true });

// ✅ 正确方式：页面加载时不渲染，元素可见时再渲染
mermaid.initialize({ startOnLoad: false });

// 切换页面时渲染
function showPage(pageNum) {
    // 1. 先显示元素
    document.querySelectorAll('.slide').forEach(slide => {
        slide.style.display = 'none';
    });
    document.querySelector(`.slide[data-page="${pageNum}"]`).style.display = 'block';
    
    // 2. 再渲染 Mermaid（元素可见后）
    setTimeout(() => {
        const slide = document.querySelector(`.slide[data-page="${pageNum}"]`);
        const mermaidDivs = slide.querySelectorAll('.mermaid:not([data-processed])');
        mermaidDivs.forEach(div => {
            mermaid.run({ nodes: [div] });
        });
    }, 100);  // 必须延迟，等待 CSS 生效
}
```

---

## 三、Mermaid 语法最佳实践

### 1. 基本语法结构

```
flowchart TB          # 方向：TB=上到下, LR=左到右, RL=右到左, BT=下到上
A1[节点名称] --> B1[节点名称]
A2 --> B2             # 节点 ID 不能重复
```

### 2. 特殊节点类型

```
A[矩形节点]           # 默认矩形，用于流程节点
B{菱形节点}           # 条件判断，用于分支判断
C((圆形节点))         # 开始/结束点
D[[子图节点]]         # 子流程引用
```

### 3. 箭头标签

```
A -->|"标签文字"| B   # 箭头上的文字（条件/说明）
A -->|yes| B          # 简短标签
A -->|pass| C         # 通行标签
```

### 4. 代码放置规则（重要）

```html
<!-- ❌ 错误：Mermaid 代码有缩进 -->
<div class="mermaid">
    flowchart TB         # 缩进会导致解析失败
    A --> B              # 缩进会导致解析失败
</div>

<!-- ✅ 正确：Mermaid 代码从行首开始，无缩进 -->
<div class="mermaid">
flowchart TB
A --> B
</div>
```

### 5. 节点 ID 唯一性

```
# ❌ 错误：同一页面内节点 ID 重复
A1[节点] --> A1[节点]   # ID 重复

# ✅ 正确：每个节点使用唯一 ID
A1[节点A] --> B1[节点B]
```

---

## 四、SVG 尺寸与 CSS 适配

### 1. Mermaid 生成的 SVG 属性

```html
<svg 
  id="mermaid-xxx"
  width="100%"                    # 继承父元素宽度
  viewBox="0 0 785 718"            # 原始尺寸（宽 x 高）
  style="max-width: 785px;"       # 最大宽度限制
>
```

### 2. 尺寸压缩问题

```
viewBox: 0 0 785 718    # 原始尺寸 785px
实际显示: 300px         # 被压缩
原因: width="100%" 继承了被压缩的父元素宽度
```

### 3. JavaScript 尺寸修正

```javascript
// 渲染后修正 SVG 尺寸
mermaid.run({ nodes: [div] }).then(() => {
    const svg = div.querySelector('svg');
    if (svg) {
        const viewbox = svg.getAttribute('viewBox');
        if (viewbox) {
            const viewboxWidth = parseFloat(viewbox.split(' ')[2]);
            // 设置为原始尺寸（或屏幕适配）
            const maxWidth = Math.min(viewboxWidth, window.innerWidth - 100);
            svg.style.width = maxWidth + 'px';
        }
    }
});
```

---

## 五、CSS 居中布局方案

### 方案对比

| 方案 | 代码 | 适用场景 |
|------|------|---------|
| **Flexbox（推荐）** | `display: flex; justify-content: center;` | 弹性居中，响应式适配 |
| Block + margin | `display: block; margin: 0 auto;` | 固定宽度元素 |
| inline-block + text-align | `text-align: center; display: inline-block;` | 文本流居中 |
| Grid | `display: grid; place-items: center;` | 网格布局 |

### 推荐 CSS 样式

```css
.mermaid-box {
    display: flex;
    justify-content: center;
    overflow-x: auto;          /* 大图表可横向滚动 */
    padding: 1rem;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 8px;
}

.mermaid-box .mermaid {
    flex-shrink: 0;            /* 防止图表被压缩 */
}

.mermaid-box svg {
    max-width: 100%;           /* 响应式宽度限制 */
    height: auto;              /* 保持比例 */
}
```

---

## 六、完整实现模板

### HTML 结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>演示幻灯片</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        .slide { 
            display: none; 
            width: 100vw; 
            height: 100vh; 
            padding: 2rem;
        }
        .slide.active { display: flex; flex-direction: column; }
        
        .mermaid-box {
            display: flex;
            justify-content: center;
            overflow-x: auto;
            padding: 1rem;
        }
        
        .mermaid-box svg {
            max-width: 100%;
            height: auto;
        }
    </style>
</head>
<body>
    <div class="slide active" data-page="1">
        <h2>架构图示例</h2>
        <div class="mermaid-box">
            <div class="mermaid">
flowchart TB
A1[输入] --> B1[处理]
B1 --> C1{判断}
C1 -->|yes| D1[输出A]
C1 -->|no| E1[输出B]
            </div>
        </div>
    </div>
    
    <div class="slide" data-page="2" data-has-mermaid="true">
        <h2>复杂流程图</h2>
        <div class="mermaid-box">
            <div class="mermaid">
flowchart TB
    Start((开始)) --> Process[处理流程]
    Process --> Decision{条件判断}
    Decision -->|通过| Success[成功]
    Decision -->|失败| Retry[重试]
    Retry --> Process
    Success --> End((结束))
            </div>
        </div>
    </div>
    
    <script>
        // Mermaid 配置
        mermaid.initialize({
            startOnLoad: false,      // 关键：不在加载时渲染
            theme: 'dark',
            flowchart: {
                curve: 'basis',
                padding: 15
            },
            securityLevel: 'loose'
        });
        
        // 渲染状态跟踪
        const renderedPages = new Set();
        const mermaidPages = [2];  // 包含 Mermaid 的页面
        
        // 页面切换函数
        function showPage(pageNum) {
            // 切换显示状态
            document.querySelectorAll('.slide').forEach(slide => {
                slide.classList.remove('active');
                if (parseInt(slide.dataset.page) === pageNum) {
                    slide.classList.add('active');
                }
            });
            
            // 延迟渲染 Mermaid
            if (mermaidPages.includes(pageNum) && !renderedPages.has(pageNum)) {
                setTimeout(() => {
                    const slide = document.querySelector(`.slide[data-page="${pageNum}"]`);
                    const mermaidDivs = slide.querySelectorAll('.mermaid:not([data-processed])');
                    
                    mermaidDivs.forEach(div => {
                        mermaid.run({ nodes: [div] }).then(() => {
                            // 修正 SVG 尺寸
                            const svg = div.querySelector('svg');
                            if (svg) {
                                const viewbox = svg.getAttribute('viewBox');
                                if (viewbox) {
                                    const viewboxWidth = parseFloat(viewbox.split(' ')[2]);
                                    const maxWidth = Math.min(viewboxWidth, window.innerWidth - 100);
                                    svg.style.width = maxWidth + 'px';
                                }
                            }
                        });
                    });
                    
                    renderedPages.add(pageNum);
                }, 100);
            }
        }
        
        // 导航控制
        function nextPage() {
            const current = document.querySelector('.slide.active');
            const next = parseInt(current.dataset.page) + 1;
            if (next <= document.querySelectorAll('.slide').length) {
                showPage(next);
            }
        }
        
        function prevPage() {
            const current = document.querySelector('.slide.active');
            const prev = parseInt(current.dataset.page) - 1;
            if (prev >= 1) {
                showPage(prev);
            }
        }
        
        // 键盘导航
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') nextPage();
            if (e.key === 'ArrowLeft') prevPage();
        });
    </script>
</body>
</html>
```

---

## 七、常见错误速查表

| 错误表现 | 原因 | 解决方案 |
|---------|------|---------|
| SVG 只显示 `"|"` | Mermaid 未加载或语法错误 | 检查 CDN 是否加载成功、语法是否正确 |
| SVG viewBox="16x16" | 在 `display: none` 中渲染 | 使用延迟渲染策略 |
| SVG 尺寸被压缩（300px） | `width="100%"` 继承父元素 | JS 修正尺寸或调整父元素宽度 |
| Syntax error in text | 节点 ID 重复 / 代码有缩进 | 检查 ID 唯一性、去除代码缩进 |
| 图表不居中 | CSS 布局问题 | 使用 Flexbox 居中方案 |
| 中文节点显示异常 | 编码问题 | 确保 `<meta charset="UTF-8">` |

---

## 八、Mermaid 初始化配置详解

```javascript
mermaid.initialize({
    startOnLoad: false,      // 是否在页面加载时渲染
    
    // 主题配置
    theme: 'dark',           // dark / default / forest / neutral
    themeVariables: {
        primaryColor: '#0f3460',
        primaryTextColor: '#eaeaea',
        primaryBorderColor: '#e94560',
        lineColor: '#eaeaea',
        secondaryColor: '#16213e',
        tertiaryColor: '#1a1a2e'
    },
    
    // 流程图配置
    flowchart: {
        curve: 'basis',      // basis / linear / step / stepAfter / stepBefore
        padding: 15,         // 节点间距
        nodeSpacing: 50,     // 节点水平间距
        rankSpacing: 50      // 节点垂直间距
    },
    
    // 安全级别
    securityLevel: 'loose',  // loose / strict / antiscript / sandbox
    
    // 其他配置
    logLevel: 'error',       // debug / info / warn / error / fatal
    er: { useMaxWidth: true },
    sequence: { useMaxWidth: true }
});
```

---

## 九、图表类型快速参考

| 图表类型 | 语法 | 使用场景 |
|---------|------|---------|
| 流程图 | `flowchart TB/LR` | 架构、流程、决策树 |
| 时序图 | `sequenceDiagram` | API 调用、交互流程 |
| 类图 | `classDiagram` | 类结构、继承关系 |
| 状态图 | `stateDiagram` | 状态流转、生命周期 |
| ER图 | `erDiagram` | 数据库结构、实体关系 |
| 甘特图 | `gantt` | 项目计划、时间线 |
| 饼图 | `pie` | 数据分布、占比 |
| 思维导图 | `mindmap` | 知识结构、层次关系 |

---

## 十、最佳实践总结

### 核心要点

1. **延迟渲染**：`startOnLoad: false`，在页面切换时渲染
2. **无缩进代码**：Mermaid 代码必须从行首开始
3. **尺寸修正**：渲染后根据 viewBox 设置 SVG 宽度
4. **Flexbox 居中**：`display: flex; justify-content: center;`

### 集成清单

生成包含 Mermaid 的幻灯片时，确保：

- [ ] Mermaid CDN 正确加载
- [ ] `startOnLoad: false` 配置
- [ ] 页面切换时触发渲染
- [ ] CSS 样式支持居中显示
- [ ] SVG 尺寸修正逻辑
- [ ] 渲染状态跟踪（避免重复渲染）
- [ ] UTF-8 编码声明

---

本文档涵盖了 Mermaid 架构图渲染的核心知识。遇到问题时，按以下顺序排查：

1. 检查 Mermaid CDN 是否加载
2. 检查语法是否正确（无缩进、ID唯一）
3. 检查是否使用了延迟渲染
4. 检查 CSS 居中样式
5. 检查 SVG 尺寸修正逻辑