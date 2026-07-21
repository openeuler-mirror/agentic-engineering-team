# Typography Guidelines for HTML Presentations

## Core Principles

1. **Readability is king** - Font must be legible at presentation distance
2. **Establish hierarchy** - Use size, weight, and color to show importance
3. **Maintain consistency** - Use the same fonts throughout
4. **Limit variety** - 2-3 font families maximum
5. **Consider context** - Match tone to content and audience

---

## Font Recommendations

### Primary Font Families

#### 1. System Fonts (Fastest, No External Loading)

**Sans-Serif Stack:**
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             'Helvetica Neue', Arial, sans-serif;
```

**Best for:**
- Technology presentations
- Modern, clean aesthetic
- Fast loading (no external requests)
- Cross-platform consistency

**Use cases:**
- Headings: Bold, 700 weight
- Body text: Regular, 400 weight
- Captions: Light, 300 weight

---

#### 2. Google Fonts (Free, Wide Variety)

**Roboto (Modern, Clean)**
```css
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

font-family: 'Roboto', sans-serif;
```

**Best for:**
- Professional presentations
- Technology and business
- Clean, geometric design
- Excellent readability

---

**Open Sans (Friendly, Readable)**
```css
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;700&display=swap');

font-family: 'Open Sans', sans-serif;
```

**Best for:**
- Educational presentations
- Corporate communications
- Friendly, approachable tone
- Excellent on-screen readability

---

**Montserrat (Modern, Bold)**
```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;700&display=swap');

font-family: 'Montserrat', sans-serif;
```

**Best for:**
- Creative presentations
- Marketing and branding
- Bold, impactful headings
- Modern aesthetic

---

**Lato (Professional, Balanced)**
```css
@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');

font-family: 'Lato', sans-serif;
```

**Best for:**
- Business presentations
- Professional reports
- Balanced, neutral tone
- Versatile applications

---

**Poppins (Geometric, Modern)**
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;700&display=swap');

font-family: 'Poppins', sans-serif;
```

**Best for:**
- Startup presentations
- Technology and innovation
- Geometric, clean design
- Strong visual presence

---

#### 3. Monospace Fonts (For Code)

**Fira Code (Modern, Readable)**
```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap');

font-family: 'Fira Code', monospace;
```

**Best for:**
- Code examples
- Technical content
- Programming presentations
- Developer audiences

---

**JetBrains Mono (Developer-Focused)**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

font-family: 'JetBrains Mono', monospace;
```

**Best for:**
- Developer presentations
- Technical documentation
- IDE-like consistency
- Professional code display

---

**Consolas (System Monospace)**
```css
font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
```

**Best for:**
- Code slides
- Technical content
- No external loading
- System consistency

---

## Font Sizing Guidelines

### Desktop Presentations (1920x1080)

```css
/* Title Slide */
.title-slide h1 {
  font-size: 4.5rem;      /* 72px */
  font-weight: 700;
  line-height: 1.1;
}

.title-slide h2 {
  font-size: 2.5rem;      /* 40px */
  font-weight: 400;
  line-height: 1.3;
}

/* Content Slides */
.slide h1 {
  font-size: 3.5rem;      /* 56px */
  font-weight: 700;
  line-height: 1.2;
}

.slide h2 {
  font-size: 2.5rem;      /* 40px */
  font-weight: 600;
  line-height: 1.3;
}

.slide h3 {
  font-size: 1.8rem;      /* 28.8px */
  font-weight: 500;
  line-height: 1.4;
}

.slide p {
  font-size: 1.3rem;      /* 20.8px */
  font-weight: 400;
  line-height: 1.6;
}

.slide ul li {
  font-size: 1.4rem;      /* 22.4px */
  font-weight: 400;
  line-height: 1.6;
}

/* Code Blocks */
.code-block pre {
  font-size: 1.1rem;      /* 17.6px */
  font-weight: 400;
  line-height: 1.5;
}

/* Captions and Metadata */
.caption {
  font-size: 1rem;        /* 16px */
  font-weight: 300;
  line-height: 1.4;
}
```

### Tablet Presentations (768px - 1023px)

```css
/* Scale down by 0.8 */
.title-slide h1 { font-size: 3.6rem; }
.slide h1 { font-size: 2.8rem; }
.slide h2 { font-size: 2rem; }
.slide p { font-size: 1.1rem; }
```

### Mobile Presentations (< 768px)

```css
/* Scale down by 0.6 */
.title-slide h1 { font-size: 2.7rem; }
.slide h1 { font-size: 2.1rem; }
.slide h2 { font-size: 1.5rem; }
.slide p { font-size: 1rem; }
```

---

## Font Weight Scale

```css
/* Light */
.font-light { font-weight: 300; }

/* Regular */
.font-regular { font-weight: 400; }

/* Medium */
.font-medium { font-weight: 500; }

/* Semi-Bold */
.font-semibold { font-weight: 600; }

/* Bold */
.font-bold { font-weight: 700; }

/* Extra Bold */
.font-extrabold { font-weight: 800; }
```

**Usage Guidelines:**
- **300 (Light):** Captions, metadata, subtle text
- **400 (Regular):** Body text, paragraphs
- **500 (Medium):** Subheadings, emphasis
- **600 (Semi-Bold):** Secondary headings
- **700 (Bold):** Primary headings, titles
- **800 (Extra Bold):** Hero titles, major emphasis

---

## Line Height Guidelines

```css
/* Tight */
.line-height-tight { line-height: 1.1; }

/* Normal */
.line-height-normal { line-height: 1.3; }

/* Relaxed */
.line-height-relaxed { line-height: 1.5; }

/* Loose */
.line-height-loose { line-height: 1.8; }
```

**Usage Guidelines:**
- **1.1 (Tight):** Large headings, titles
- **1.3 (Normal):** Subheadings, short text
- **1.5 (Relaxed):** Body text, paragraphs
- **1.8 (Loose):** Long paragraphs, quotes

---

## Letter Spacing Guidelines

```css
/* Tight */
.letter-spacing-tight { letter-spacing: -0.02em; }

/* Normal */
.letter-spacing-normal { letter-spacing: 0; }

/* Wide */
.letter-spacing-wide { letter-spacing: 0.05em; }

/* Extra Wide */
.letter-spacing-wider { letter-spacing: 0.1em; }
```

**Usage Guidelines:**
- **-0.02em (Tight):** Large display text
- **0 (Normal):** Body text, most content
- **0.05em (Wide):** Uppercase headings, labels
- **0.1em (Extra Wide):** Small caps, decorative text

---

## Text Alignment

```css
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-justify { text-align: justify; }
```

**Usage Guidelines:**
- **Left:** Body text, lists, most content
- **Center:** Titles, headings, quotes
- **Right:** Numbers, dates, metadata
- **Justify:** Multi-column text (rare in slides)

---

## Text Transform

```css
.text-uppercase { text-transform: uppercase; }
.text-lowercase { text-transform: lowercase; }
.text-capitalize { text-transform: capitalize; }
```

**Usage Guidelines:**
- **Uppercase:** Short labels, buttons, emphasis
- **Lowercase:** URLs, hashtags
- **Capitalize:** Titles, headings (sentence case)

---

## Typography Hierarchy

### Level 1: Hero Title
```css
.hero-title {
  font-size: 4.5rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-align: center;
}
```

### Level 2: Section Title
```css
.section-title {
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
```

### Level 3: Subsection Title
```css
.subsection-title {
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}
```

### Level 4: Body Text
```css
.body-text {
  font-size: 1.3rem;
  font-weight: 400;
  line-height: 1.6;
}
```

### Level 5: Caption
```css
.caption {
  font-size: 1rem;
  font-weight: 300;
  line-height: 1.4;
  color: var(--text-muted);
}
```

---

## Special Typography Cases

### Code Typography
```css
.code-typography {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0;
}
```

### Quote Typography
```css
.quote-typography {
  font-size: 2rem;
  font-weight: 400;
  line-height: 1.6;
  font-style: italic;
  text-align: center;
}
```

### Number Typography
```css
.number-typography {
  font-family: 'Roboto Mono', monospace;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.05em;
}
```

---

## Accessibility Considerations

### Minimum Font Sizes
- **Body text:** 18px minimum (16px absolute minimum)
- **Headings:** 24px minimum
- **Captions:** 14px minimum

### Responsive Font Sizing with clamp()

**核心规则：clamp() 最小值 ≥ 1rem (16px)**

响应式设计中，`clamp()` 的最小值代表"最不利条件下"的字号，必须保证可读性。

```css
/* 正确：最小值 ≥ 1rem */
font-size: clamp(1rem, 2vw, 1.5rem);    /* 正文 */
font-size: clamp(1.2rem, 2.5vw, 2rem);  /* 标题 */

/* 错误：最小值太小 */
font-size: clamp(0.8rem, ...);  /* ❌ 12.8px - 太小 */
font-size: clamp(0.9rem, ...);  /* ❌ 14.4px - 不够清晰 */
```

**检查方法：**
```bash
grep -n "clamp(0\.[0-9]" *.html  # 查找所有小于 1rem 的设置
```

### Contrast Requirements
- **Normal text:** 4.5:1 contrast ratio minimum
- **Large text:** 3:1 contrast ratio minimum
- **Large text =** 18px+ bold or 24px+ regular

### Readability Tips
1. Avoid pure black (#000000) on pure white (#ffffff)
2. Use dark gray (#333333) for better readability
3. Ensure sufficient line height (1.5+ for body text)
4. Limit line length to 60-75 characters
5. Avoid narrow fonts at small sizes

---

## Performance Optimization

### Font Loading Strategies

**Strategy 1: Critical CSS Inline**
```html
<style>
  /* Inline critical CSS for above-fold content */
  body { font-family: -apple-system, sans-serif; }
</style>

<link rel="preload" href="fonts.woff2" as="font" type="font/woff2" crossorigin>
```

**Strategy 2: Font Display Swap**
```css
@font-face {
  font-family: 'Roboto';
  src: url('roboto.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately */
}
```

**`font-display` values:**
- **auto:** Browser default
- **block:** Short blocking period, then swap
- **swap:** Show fallback immediately, swap when loaded
- **fallback:** Very short blocking, then fallback
- **optional:** Very short blocking, then don't swap

---

## Quick Reference

| Element | Font Size | Weight | Line Height |
|---------|-----------|--------|-------------|
| Hero Title | 4.5rem (72px) | 700 | 1.1 |
| Section Title | 3.5rem (56px) | 700 | 1.2 |
| Subsection Title | 2.5rem (40px) | 600 | 1.3 |
| Body Text | 1.3rem (20.8px) | 400 | 1.6 |
| Caption | 1rem (16px) | 300 | 1.4 |
| Code | 1.1rem (17.6px) | 400 | 1.5 |
| Quote | 2rem (32px) | 400 | 1.6 |

---

## Implementation Example

```css
:root {
  /* Font families */
  --font-primary: 'Roboto', -apple-system, sans-serif;
  --font-mono: 'Fira Code', 'Consolas', monospace;

  /* Font sizes */
  --font-size-hero: 4.5rem;
  --font-size-title: 3.5rem;
  --font-size-subtitle: 2.5rem;
  --font-size-body: 1.3rem;
  --font-size-caption: 1rem;
  --font-size-code: 1.1rem;

  /* Font weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Line heights */
  --line-height-tight: 1.1;
  --line-height-normal: 1.3;
  --line-height-relaxed: 1.5;
  --line-height-loose: 1.8;
}

body {
  font-family: var(--font-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-relaxed);
}

h1 {
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

h2 {
  font-size: var(--font-size-subtitle);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-normal);
}

p {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-relaxed);
}

code, pre {
  font-family: var(--font-mono);
  font-size: var(--font-size-code);
  line-height: var(--line-height-relaxed);
}
```
