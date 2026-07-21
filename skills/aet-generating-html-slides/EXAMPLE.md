# HTML-PPTX 使用示例

## 示例：构建专业演示文稿

以下示例展示如何使用 aet-generating-html-slides skill 构建符合屏幕比例和颜色规范的专业演示文稿。

## 步骤 1：读取源文档

```markdown
用户：从项目文档创建演示文稿
→ 读取 markdown 文件
→ 提取章节和关键点
→ 进入步骤 2
```

## 步骤 2：创建演示文稿大纲

```markdown
幻灯片 1：封面页
  - 演示文稿标题
  - 副标题/作者信息

幻灯片 2：目录/概览
  - 主要主题列表

幻灯片 3-N：内容幻灯片
  - 主标题
  - 2-3 个要点或关键概念
  - 支持细节（可选）

幻灯片 N+1：结论/总结
  - 关键要点

幻灯片 N+2：Q&A / 谢谢
```

## 步骤 3：设计幻灯片布局和内容

**设计哲学选择**：专业商务风格

## 步骤 4：构建 HTML 演示文稿

### 控制按钮最佳实践（CRITICAL）

**MUST DO:**
1. **将控制按钮放在右下角**
   - 使用 `position: fixed; bottom: 1.5rem; right: 1.5rem;`
   - 避免 `left: 50%; transform: translateX(-50%);`（会阻挡内容）

2. **翻页控件必须支持“半隐藏”**
   - 增加一个独立的小圆形 toggle 按钮（建议 30-34px）
   - 点击后让 controls 面板向下滑出视口，仅保留 **半个小圆** 露出作为入口
   - 再次点击小圆可恢复完整控件，避免长时间遮挡正文
   - 推荐状态类：`.controls.is-hidden` + `.controls-toggle.collapsed`

3. **使控制按钮紧凑且不显眼**
   - 较小内边距：`padding: 0.5rem 1rem;`
   - 较小字体：`font-size: 0.85rem;`
   - 减小阴影：`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);`
   - 细边框：`border: 1px solid var(--gray-medium);`

4. **优化进度指示器**
   - 添加背景色：`background: var(--gray-light);`
   - 添加内边距：`padding: 0.25rem 0.5rem;`
   - 添加圆角：`border-radius: 6px;`
   - 使用次要文本色：`color: var(--text-secondary);`

**示例 CSS:**
```css
.controls {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 1000;
  background: var(--light);
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--gray-medium);
}

.controls button {
  background: var(--primary);
  color: var(--light);
  border: none;
  padding: 0.5rem 1rem;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 0.85rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.progress {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 70px;
  text-align: center;
  padding: 0.25rem 0.5rem;
  background: var(--gray-light);
  border-radius: 6px;
}
```

### 架构图最佳实践（CRITICAL）

**MUST DO:**
1. **使用响应式布局**
   - 为容器添加 `max-width` 限制
   - 使用 `clamp()` 实现响应式字体大小
   - 使用 Flexbox 垂直布局

2. **创建视觉层次**
   - 使用交替颜色（primary/secondary）
   - 添加箭头指示器
   - 应用一致的边框样式
   - 确保文本适合框内

3. **确保内容适合视口**
   - 使用 `max-width` 而非固定宽度
   - 测试不同屏幕尺寸
   - 允许垂直滚动：`overflow-y: auto`

**示例架构图:**
```html
<div class="box" style="max-width: 800px; padding: 1.5rem;">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
    <div style="padding: 0.6rem 1.2rem; border: 2px solid var(--primary); border-radius: 8px; background: var(--gray-light); width: 100%; max-width: 500px;">
      <strong style="color: var(--primary); font-size: clamp(0.95rem, 1.8vw, 1.1rem);">用户请求层</strong>
    </div>
    <div style="color: var(--secondary); font-size: 1.2rem;">↓</div>
    <div style="padding: 0.6rem 1.2rem; border: 2px solid var(--secondary); border-radius: 8px; background: var(--gray-light); width: 100%; max-width: 500px;">
      <strong style="color: var(--secondary); font-size: clamp(0.95rem, 1.8vw, 1.1rem);">自适应协调协议层</strong>
    </div>
    <!-- 更多层... -->
  </div>
</div>
```

**架构图 CSS:**
```css
/* 容器 */
.architecture-box {
  max-width: 800px;
  padding: 1.5rem;
}

/* 垂直流布局 */
.architecture-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

/* 单个层框 */
.architecture-layer {
  padding: 0.6rem 1.2rem;
  border: 2px solid var(--primary);
  border-radius: 8px;
  background: var(--gray-light);
  width: 100%;
  max-width: 500px;
}

/* 响应式文本 */
.architecture-layer strong {
  font-size: clamp(0.95rem, 1.8vw, 1.1rem);
}

/* 箭头指示器 */
.arrow-down {
  color: var(--secondary);
  font-size: 1.2rem;
}
```

## 屏幕比例和布局示例

### CSS 变量定义

```css
:root {
  /* 颜色系统 - 专业商务风格 */
  --primary: #2563eb;
  --secondary: #7c3aed;
  --accent: #f59e0b;
  --dark: #1e293b;
  --light: #ffffff;
  --gray-light: #f1f5f9;
  --gray-medium: #94a3b8;
  --gray-dark: #475569;
  --text-main: #1e293b;
  --text-secondary: #64748b;
}
```

### 响应式字体大小

```css
/* 使用 clamp() 确保所有屏幕尺寸的可读性 */
h1 {
  font-size: clamp(2.5rem, 5vw, 4rem);
}

h2 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

p {
  font-size: clamp(0.9rem, 1.8vw, 1.15rem);
}
```

### 响应式网格布局

```css
.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  max-width: 1100px;
  width: 100%;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  max-width: 1300px;
  width: 100%;
}
```

### 溢出处理

```css
.slide {
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100vh;
}
```

### 响应式断点

```css
/* 平板 */
@media (max-width: 1024px) {
  .slide {
    padding: 2rem 2.5rem;
  }
  
  .grid-2, .grid-3 {
    grid-template-columns: 1fr;
  }
}

/* 移动设备 */
@media (max-width: 640px) {
  .slide {
    padding: 1.5rem 1.25rem;
  }
  
  h1 {
    font-size: 2rem;
  }
  
  h2 {
    font-size: 1.5rem;
  }
}
```

## 颜色设计示例

### 专业商务配色方案

```css
/* 主背景色 */
body {
  background: var(--gray-light);
  color: var(--text-main);
}

/* 幻灯片背景 */
.slide {
  background: var(--light);
}

/* 标题颜色 */
h1, h2, h3 {
  color: var(--primary);
}

/* 高亮文本 */
.highlight {
  color: var(--primary);
  font-weight: 700;
}

/* 次要高亮 */
.highlight-secondary {
  color: var(--secondary);
  font-weight: 700;
}

/* 强调高亮 */
.highlight-accent {
  color: var(--accent);
  font-weight: 700;
}
```

### 盒子样式

```css
.box {
  background: var(--gray-light);
  color: var(--text-main);
  padding: 1.5rem 2rem;
  border: 2px solid var(--primary);
  border-radius: 12px;
  margin: 1rem 0;
  max-width: 900px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

/* 深色盒子 */
.box-dark {
  background: var(--dark);
  color: var(--light);
  border-color: var(--secondary);
}

/* 高亮盒子 */
.box-highlight {
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  color: var(--light);
  border: none;
}
```

## 验证和质量检查

### 使用验证脚本

```bash
# 验证 HTML 文件
python3 tools/validate_html.py presentation.html
```

### 质量检查清单

**编码和结构**：
- [ ] 文件保存为 UTF-8
- [ ] `<meta charset="UTF-8">` 存在
- [ ] 正确的 `lang` 属性
- [ ] 无格式错误的 HTML 标签
- [ ] 所有标签正确闭合

**内容和显示**：
- [ ] 中文字符正确显示
- [ ] 无乱码文本
- [ ] 所有图像加载
- [ ] 字体正确加载
- [ ] 链接正常工作

**功能**：
- [ ] 导航工作（键盘 + 按钮）
- [ ] 过渡平滑
- [ ] 全屏模式工作
- [ ] 进度指示器准确

**跨浏览器**：
- [ ] 在 Chrome/Edge 中测试
- [ ] 在 Firefox 中测试
- [ ] 在 Safari 中测试（如果可用）
- [ ] 移动响应式已测试

**屏幕比例**：
- [ ] 内容适合 16:9 比例
- [ ] 无水平滚动
- [ ] 垂直滚动仅在必要时
- [ ] 在不同屏幕尺寸上测试

**颜色和可读性**：
- [ ] 白色/浅色背景
- [ ] 高对比度文本
- [ ] 专业配色方案
- [ ] 无霓虹/荧光色
- [ ] 在演示模式下测试

**控制按钮**：
- [ ] 位于右下角（不阻挡内容）
- [ ] 紧凑且不显眼
- [ ] 适当的 z-index
- [ ] 良好的悬停效果

**架构图**：
- [ ] 使用响应式布局
- [ ] 文本适合框内
- [ ] 颜色交替正确
- [ ] 箭头指示器清晰可见
- [ ] 在小屏幕上正常显示

## 完整示例

参见 `multi-agent-projects-presentation.html` 以获取完整的示例实现，包括：

- 14 张幻灯片
- 专业商务配色方案
- 响应式布局
- 屏幕比例优化
- 优化的控制按钮位置
- 改进的架构图布局
- 完整的交互功能

## 最佳实践

**内容**：
- 每张幻灯片一个主要观点
- 最多 3-5 个要点
- 使用视觉元素支持而非装饰
- 实践 10/20/30 规则（10 张幻灯片，20 分钟，30pt 字体）

**设计**：
- 保持一致的样式
- 使用高对比度以提高可读性
- 留出充足的空白
- 选择专业的调色板

**技术**：
- 在多个浏览器上测试
- 确保移动响应式
- 优化图像以用于 Web
- 提供键盘快捷键

**交付**：
- 包含演讲者注释
- 练习计时
- 准备技术问题
- 有备份计划
