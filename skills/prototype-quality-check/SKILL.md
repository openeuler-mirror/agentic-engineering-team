---
name: prototype-quality-check
description: 原型质量检查方法。用于验证 HTML/CSS/JS 原型文件的语法正确性、样式完整性、交互可用性、结构规范性和响应式设计。包含检查方法和诊断思路。
---

# Prototype Quality Check

原型质量检查方法，用于诊断和修复 HTML/CSS/JS 产品原型的常见问题。

## Overview

本 skill 提供通用的原型质量验证方法，帮助诊断：
- JavaScript 语法错误
- CSS 类名缺失导致的显示问题
- onclick 函数未暴露导致的交互失效
- HTML 结构配置问题
- 响应式设计问题（移动端布局异常）

## Quality Dimensions

| 维度 | 检查内容 | 验证方式 |
|------|----------|----------|
| **语法正确性** | JS 语法无错误 | `node -c` |
| **样式完整性** | JS 使用类名均有 CSS 定义 | grep 类名对比 |
| **交互可用性** | onclick 函数已暴露到全局 | grep window.xxx |
| **结构规范性** | charset、引用路径配置 | 文件内容检查 |
| **响应式设计** | 自动适配不同设备尺寸 | 布局属性检查 |

## Workflow

```
Step 1: 文件存在性检查
Step 2: JavaScript 语法验证
Step 3: CSS 类名完整性检查
Step 4: onclick 函数暴露检查
Step 5: HTML 结构检查
Step 6: 响应式设计检查
Step 7: 生成诊断报告
```

## Step 1: 文件存在性检查

```bash
ls -la {PROJECT_PATH}/prototype/
```

**必须存在：** `index.html`、`styles.css`、`app.js`

## Step 2: JavaScript 语法验证

```bash
node -c {PROJECT_PATH}/prototype/app.js 2>&1
```

**预期：** 无输出表示语法正确。

**常见语法错误类型：**
- 未闭合括号/花括号
- 字符串引号不匹配
- 变量声明位置错误
- 注释格式错误

## Step 3: CSS 类名完整性检查

**检查思路：JS 渲染函数使用的 class 属性是否在 CSS 中有对应样式定义。**

**提取 JS 中使用的类名：**

```bash
grep -oP 'class="[^"]*"' {PROJECT_PATH}/prototype/app.js | \
  sed 's/class="//g;s/"//g' | tr ' ' '\n' | sort -u > /tmp/js_classes.txt
```

**提取 CSS 中定义的类名：**

```bash
grep -oP '\.[a-zA-Z][a-zA-Z0-9_-]*' {PROJECT_PATH}/prototype/styles.css | \
  sed 's/^\.//g' | sort -u > /tmp/css_classes.txt
```

**对比缺失类名：**

```bash
comm -23 /tmp/js_classes.txt /tmp/css_classes.txt
```

**修复原则：** 对于每个缺失的类名，在 styles.css 中添加对应样式定义。

## Step 4: onclick 函数暴露检查

**检查思路：onclick 属性调用的函数必须暴露到 window 对象才能被 HTML 调用。**

**提取 onclick 调用的函数名：**

```bash
grep -oP 'onclick="[^"]*"' {PROJECT_PATH}/prototype/app.js | \
  sed 's/onclick="//g;s/"//g' | \
  grep -oP '[a-zA-Z_][a-zA-Z0-9_]*\(' | sed 's/(//g' | sort -u
```

**检查 window 暴露：**

```bash
grep -oP 'window\.[a-zA-Z_][a-zA-Z0-9_]* =' {PROJECT_PATH}/prototype/app.js | \
  sed 's/window\.//g;s/ =$//g' | sort -u
```

**对比检查：**

对每个 onclick 调用的函数，检查是否存在于 window 暴露列表中。

**修复原则：** 对于未暴露的函数，添加 `window.xxx = function() {...}` 暴露到全局作用域。

## Step 5: HTML 结构检查

**检查关键 HTML 元素：**

| 元素 | 检查命令 |
|------|----------|
| charset | `grep '<meta charset="UTF-8">' index.html` |
| CSS 引用 | `grep 'href="styles.css"' index.html` |
| JS 引用 | `grep 'src="app.js"' index.html` |

**检查外部资源 CDN 是否有效：** 确认外部脚本/样式库的 URL 正确。

## Step 6: 响应式设计检查

**核心原则：设计一次，自动适配所有设备**

### 检查自动适配技术

**检查 CSS 是否使用了自动适配技术：**

| 技术 | 用途 | 检查命令 |
|------|------|----------|
| `clamp()` | 字体/间距自动缩放 | `grep -c 'clamp(' styles.css` |
| `auto-fit + minmax()` | 网格自动列数 | `grep -c 'auto-fit' styles.css` |
| `% + max-width` | 容器弹性宽度 | `grep -c 'max-width' styles.css` |
| `flex-wrap` | 弹性换行 | `grep -c 'flex-wrap' styles.css` |
| `viewport meta` | 视口配置 | `grep 'viewport' index.html` |

**预期结果：**
- 字体大小应使用 `clamp(min, preferred, max)` 而非固定 px/rem
- 网格布局应使用 `repeat(auto-fit, minmax(width, 1fr))`
- 容器宽度应使用 `width: 100%; max-width: xxx`
- 弹性布局应使用 `flex-wrap: wrap`

### 检查关键布局属性（避免移动端分屏问题）

**检查 `position: absolute` 元素的定位完整性：**

```bash
grep -A5 'position: absolute' styles.css | grep -E 'inset:|top:|left:|right:|bottom:'
```

**必须满足：**
- 如果使用 `position: absolute`，必须同时指定定位约束
- 推荐：使用 `inset: 0`（等同于 top:0, right:0, bottom:0, left:0）
- 或单独指定 `top` + `left` + `width` + `height`

### 检查元素隐藏方式

**检查是否使用 `opacity` 单独隐藏元素（可能导致移动端渲染问题）：**

```bash
grep -E 'opacity: 0[^;]*;' styles.css | grep -v 'visibility'
```

**修复原则：**
- `opacity: 0` 应搭配 `visibility: hidden` 使用
- 活动元素：`visibility: visible`
- 非活动元素：`visibility: hidden`

### 检查容器溢出处理

```bash
grep -E 'overflow:\s*hidden' styles.css
```

**预期：** 主容器应有 `overflow: hidden` 防止内容溢出。

### 响应式布局最佳实践

**正确模式：**

```css
/* 字体自动缩放 */
h1 { font-size: clamp(1.5rem, 4vw, 3rem); }

/* 网格自动列数 */
.grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

/* 弹性容器 */
.container { width: 100%; max-width: 1200px; margin: 0 auto; }

/* 触控友好 */
@media (hover: none) and (pointer: coarse) {
    button { min-height: 44px; }
}
```

**常见反模式（避免）：**

| 反模式 | 问题 | 修复 |
|--------|------|------|
| `font-size: 24px` | 固定字体不适配 | 改用 `clamp(1rem, 2vw, 1.5rem)` |
| `grid-template-columns: 1fr 1fr 1fr` | 固定列数不适配 | 改用 `repeat(auto-fit, minmax(280px, 1fr))` |
| `position: absolute; width: 100%` | 缺少定位约束 | 添加 `inset: 0` |
| `opacity: 0` 单独使用 | 移动端可能仍渲染 | 添加 `visibility: hidden` |

## Step 7: 生成诊断报告

**输出格式示例：**

```
## 原型质量诊断

### JavaScript 语法
- node -c: [结果]

### CSS 类名
- JS 使用类名数: N
- CSS 定义类名数: M
- 缺失类名: [列表或"无"]

### onclick 函数暴露
- onclick 调用函数数: N
- 已暴露函数数: M
- 未暴露函数: [列表或"无"]

### 建议修复项
- [具体问题列表]
```

## Diagnostic Pattern: 页面显示异常

**症状：** 页面元素无样式、布局混乱

**诊断步骤：**
1. 先检查 JavaScript 语法（`node -c`）
2. 如果语法正确，检查 CSS 类名完整性
3. 对比 JS 使用的类名与 CSS 定义

## Diagnostic Pattern: 点击无响应

**症状：** 点击按钮/链接无反应

**诊断步骤：**
1. 检查 onclick 调用的函数名
2. 检查该函数是否暴露到 window 对象
3. 检查 onclick 参数是否正确传递

## Diagnostic Pattern: 外部资源加载失败

**症状：** 图标/样式不显示，控制台 404 错误

**诊断步骤：**
1. 检查外部资源 URL 格式
2. 确认 CDN 版本号是否正确
3. 确认初始化调用时机

## Diagnostic Pattern: 移动端布局分屏

**症状：** 移动端页面分成多个区域，只有部分区域显示内容，其他区域空白

**根因：** `position: absolute` 元素缺少定位约束，部分浏览器渲染不一致

**诊断步骤：**
1. 检查 CSS 中是否有 `position: absolute` 元素
2. 检查是否指定了 `inset` 或 `top/left/right/bottom`
3. 检查是否使用了 `opacity: 0` 但未搭配 `visibility: hidden`

**修复方案：**

```css
/* 修复前 */
.slide {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
}

/* 修复后 */
.slide {
  position: absolute;
  inset: 0;           /* 强制定位到四边 */
  visibility: hidden; /* 完全隐藏 */
  opacity: 0;
}
.slide.active {
  visibility: visible;
  opacity: 1;
  z-index: 10;
}
```

## Diagnostic Pattern: 响应式设计失效

**症状：** 页面在小屏幕上溢出、元素重叠、横向滚动

**诊断步骤：**
1. 检查是否使用固定尺寸（px、固定rem）
2. 检查网格是否使用固定列数
3. 检查是否缺少 `flex-wrap`

**修复原则：**
- 字体：固定值 → `clamp()`
- 网格：固定列 → `auto-fit + minmax()`
- 弹性布局：添加 `flex-wrap: wrap`

## Validation Checklist

**文件存在性：**
- [ ] index.html 存在
- [ ] styles.css 存在
- [ ] app.js 存在

**JavaScript 语法：**
- [ ] `node -c app.js` 无错误

**CSS 类名完整性：**
- [ ] 所有 JS 使用的类名在 CSS 中有定义

**onclick 函数暴露：**
- [ ] 所有 onclick 调用的函数已暴露到 window

**HTML 结构：**
- [ ] charset meta 存在
- [ ] CSS/JS 引用路径正确

**响应式设计（自动适配）：**
- [ ] viewport meta 存在（`width=device-width, initial-scale=1.0`）
- [ ] 字体使用 `clamp()` 自动缩放
- [ ] 网格使用 `auto-fit + minmax()` 自动列数
- [ ] 容器使用 `% + max-width` 弹性宽度
- [ ] flex 布局使用 `flex-wrap: wrap`

**布局完整性（避免分屏）：**
- [ ] `position: absolute` 元素有 `inset` 或定位约束
- [ ] `opacity: 0` 搭配 `visibility: hidden` 使用
- [ ] 主容器有 `overflow: hidden`

**触控友好：**
- [ ] 按钮/触控区域最小 44px（或 14px 进度点）
- [ ] 有触控媒体查询（`hover: none`）

## Best Practices

1. **语法优先**：先检查 JavaScript 语法，语法错误会导致整个脚本失效
2. **类名对比**：使用 grep 提取并对比类名，系统性排查缺失
3. **全局暴露**：onclick 函数必须在文件末尾统一暴露到 window
4. **CDN 验证**：外部资源 URL 需确认版本号正确
5. **延迟初始化**：动态内容渲染后需延迟调用图标初始化
6. **自动适配优先**：使用 `clamp()`、`auto-fit`、`flex-wrap` 实现"设计一次，适配所有"
7. **定位完整性**：`position: absolute` 必须搭配 `inset` 或定位约束
8. **隐藏完整性**：`opacity: 0` 必须搭配 `visibility: hidden`