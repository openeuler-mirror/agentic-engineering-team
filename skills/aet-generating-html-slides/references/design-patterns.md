# Design Patterns for HTML Slides

## Common Slide Layouts

### 1. Title Slide
**Use for:** Opening slide, chapter breaks

**Structure:**
- Large centered title (h1)
- Subtitle or tagline (p)
- Author/date information (smaller p)

**When to use:**
- First slide of presentation
- Introducing major sections
- Transitions between topics

---

### 2. Agenda/Overview Slide
**Use for:** Table of contents, roadmap

**Structure:**
- Heading: "Agenda" or "Overview"
- Numbered or bulleted list of topics
- 5-7 items maximum

**When to use:**
- After title slide
- Beginning of major sections
- Providing navigation structure

---

### 3. Bullet Points Slide
**Use for:** Presenting key concepts, lists

**Structure:**
- Heading (h2)
- 3-5 bullet points
- Each point: 1-2 lines max
- Progressive reveal (optional)

**When to use:**
- Listing features or benefits
- Outlining steps in a process
- Presenting key takeaways

**Best practices:**
- Keep points parallel in structure
- Use active language
- Avoid complete sentences
- Start with strong verbs

---

### 4. Two-Column Slide
**Use for:** Comparisons, side-by-side content

**Structure:**
- Heading (h2)
- Two equal-width columns
- Each column has its own heading and content

**When to use:**
- Comparing two options
- Before/after scenarios
- Pros/cons analysis
- Concept + explanation pairing

**Best practices:**
- Balance content between columns
- Use consistent formatting
- Ensure visual symmetry

---

### 5. Diagram/Visual Slide
**Use for:** Illustrating complex concepts

**Structure:**
- Minimal heading
- Large visual element (chart, diagram, image)
- Brief labels or captions
- Optional explanatory text below

**When to use:**
- Showing architecture
- Displaying data visualizations
- Illustrating processes
- Complex relationships

**Best practices:**
- Keep visual as focal point
- Use high-quality images
- Ensure text is readable on visual
- Add clear labels

---

### 6. Quote/Emphasis Slide
**Use for:** Highlighting important statements

**Structure:**
- Large centered quote
- Dramatic typography
- Attribution below
- Minimal other elements

**When to use:**
- Opening with powerful quote
- Emphasizing key insight
- Transition between sections
- Closing statement

**Best practices:**
- Choose impactful quotes
- Keep attribution clear
- Use generous whitespace
- Consider background variation

---

### 7. Code/Technical Slide
**Use for:** Showing code examples, technical details

**Structure:**
- Heading explaining code purpose
- Code block with syntax highlighting
- Brief explanation above or below
- Monospace font for code

**When to use:**
- Showing implementation examples
- Demonstrating API usage
- Explaining technical concepts
- Code walkthroughs

**Best practices:**
- Keep code snippets concise
- Use syntax highlighting
- Add line numbers if needed
- Explain key parts

---

### 8. Image + Text Slide
**Use for:** Visual storytelling

**Structure:**
- Image on one side (left or right)
- Text on opposite side
- Balanced layout

**When to use:**
- Product showcases
- Case studies
- Visual explanations
- Before/after comparisons

**Best practices:**
- High-quality images
- Text complements visual
- Balanced proportions
- Clear visual hierarchy

---

### 9. Process/Flow Slide
**Use for:** Showing sequential steps

**Structure:**
- Heading describing process
- Numbered steps or flow diagram
- Arrows connecting steps
- Brief description per step

**When to use:**
- Multi-step workflows
- Methodology explanations
- How-to guides
- Process improvements

**Best practices:**
- Clear step numbering
- Visual flow indicators
- Concise step descriptions
- Logical progression

---

### 10. Data/Statistics Slide
**Use for:** Presenting numbers and metrics

**Structure:**
- Heading
- Key statistics highlighted
- Supporting data
- Optional chart or graph

**When to use:**
- Business metrics
- Performance data
- Research findings
- Impact measurements

**Best practices:**
- Highlight key numbers
- Use consistent formatting
- Provide context
- Keep data clean

---

### 11. Vertical Card Layout
**Use for:** 多卡片并列展示（痛点、方案、分析维度等）

**特点：**
- 纵向排列减少两侧留白
- 卡片宽度 100% 平铺
- 适合 4+ 个卡片

**对比：横向布局适合 2-3 个卡片，纵向布局适合 4+ 个卡片**

---

### 12. Step Merging Layout
**Use for:** 多步骤流程展示

**特点：**
- 将分散的步骤页合并为单页
- 每步精简为核心要素
- 每页最多 3-4 个步骤块

**优化效果：减少页数，提升信息密度**

---

## Layout Selection Guide

| Content Type | Recommended Layout | Alternative |
|--------------|-------------------|-------------|
| Introduction | Title Slide | Quote Slide |
| Multiple topics | Agenda | Overview |
| List of items | Bullet Points | Two Columns |
| Comparison | Two Columns | Table |
| Visual concept | Diagram/Visual | Image + Text |
| Important statement | Quote Slide | Emphasis Slide |
| Code example | Code/Technical | Bullet Points |
| Step-by-step | Process/Flow | Numbered List |
| Numbers/metrics | Data/Statistics | Chart |
| Product/image | Image + Text | Diagram/Visual |

---

## Design Principles

### Visual Hierarchy
1. **Primary**: Largest element (title, main visual)
2. **Secondary**: Supporting text, headings
3. **Tertiary**: Details, captions, metadata

### Whitespace
- Use generous spacing between elements
- Don't crowd slides
- Let content breathe
- Guide eye with space

### Alignment
- Left-align text for readability
- Center-align for emphasis
- Consistent alignment throughout
- Grid-based layouts

### Contrast
- High contrast for readability
- Color contrast for emphasis
- Size contrast for hierarchy
- Use contrast intentionally

### Consistency
- Uniform fonts and sizes
- Consistent color usage
- Repeated layout patterns
- Predictable navigation

---

## Responsive Considerations

### Desktop (1024px+)
- Full layouts
- Large fonts
- Side-by-side content
- Full navigation controls

### Tablet (768px - 1023px)
- Adjusted spacing
- Slightly smaller fonts
- Stacked two-column layouts
- Touch-friendly controls

### Mobile (< 768px)
- Single column layouts
- Smaller fonts
- Simplified visuals
- Swipe navigation
- Minimal controls
