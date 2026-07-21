# Best Practices for HTML Presentations

## Content Best Practices

### The 10/20/30 Rule

- **10 slides** - Maximum number of slides
- **20 minutes** - Maximum presentation time
- **30 point font** - Minimum font size

**Why it works:**
- Forces focus on key points
- Maintains audience attention
- Ensures readability from back of room

---

### One Idea Per Slide

**Do:**
```
Slide: "Benefits of Our Solution"
• Increased efficiency by 40%
• Reduced costs by 25%
• Improved customer satisfaction
```

**Don't:**
```
Slide: "Our Solution"
• Increased efficiency by 40%
• Reduced costs by 25%
• Improved customer satisfaction
• Implementation timeline
• Technical architecture
• Team structure
• Pricing model
• Support options
• Case studies
• Testimonials
```

**Rule:** If a slide has more than 5 bullet points, split it.

---

### Keep Text Minimal

**Guidelines:**
- **Headings:** 5-7 words maximum
- **Bullet points:** 1-2 lines maximum
- **Paragraphs:** 3-4 sentences maximum
- **Total text per slide:** 40-50 words maximum

**Why:** People can't read and listen simultaneously. Let your voice provide the details.

---

### Use Parallel Structure

**Good:**
```
• Increase efficiency
• Reduce costs
• Improve satisfaction
```

**Bad:**
```
• Increasing efficiency
• Cost reduction
• Improving customer satisfaction
```

**Rule:** Start all bullets with same part of speech.

---

## Design Best Practices

### Visual Hierarchy

**Establish clear levels:**
1. **Primary:** Title, main visual (largest, boldest)
2. **Secondary:** Subheadings, key points (medium)
3. **Tertiary:** Details, captions (smallest)

**Use these tools:**
- Size (larger = more important)
- Weight (bold = emphasis)
- Color (accent = highlight)
- Position (top/left = primary)

---

### Whitespace is Your Friend

**Benefits:**
- Improves readability
- Reduces cognitive load
- Creates visual breathing room
- Guides eye through content

**Guidelines:**
- 2-3em margin between elements
- 1.5-2x line height for body text
- 3-4em padding for containers
- Don't crowd edges of slides

---

### Consistency is Key

**Maintain consistency in:**
- **Fonts:** Same families throughout
- **Colors:** Same palette throughout
- **Layout:** Similar structure for similar content
- **Spacing:** Consistent margins and padding
- **Alignment:** Grid-based positioning

**Create a style guide:**
```css
/* Define once, use everywhere */
:root {
  --primary-color: #e94560;
  --spacing-unit: 1rem;
  --border-radius: 8px;
}
```

---

### Use High-Quality Visuals

**Image guidelines:**
- **Resolution:** 1920x1080 minimum
- **Format:** WebP or optimized JPEG/PNG
- **Size:** Under 500KB per image
- **Aspect ratio:** Match slide ratio (16:9)

**Visual types:**
- **Photographs:** Product shots, team photos
- **Illustrations:** Icons, diagrams, infographics
- **Charts:** Data visualization, metrics
- **Screenshots:** UI mockups, examples

**When to use visuals:**
- ILLUSTRATE complex concepts
- PROVIDE examples
- SHOW data
- BREAK up text

---

## Technical Best Practices

### Performance Optimization

**Minimize file size:**
- Optimize images (compress, resize)
- Minify CSS and JavaScript
- Use modern formats (WebP, AVIF)
- Lazy load images

**Fast loading:**
```html
<!-- Preload critical resources -->
<link rel="preload" href="styles.css" as="style">
<link rel="preload" href="presentation.js" as="script">

<!-- Defer non-critical JavaScript -->
<script defer src="analytics.js"></script>
```

---

### Cross-Browser Compatibility

**Test on:**
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

**Use feature detection:**
```javascript
if ('requestFullscreen' in document.documentElement) {
  // Fullscreen API supported
}
```

**Provide fallbacks:**
```css
/* Modern browsers */
.slide {
  display: flex;
  gap: 1rem;
}

/* Fallback for older browsers */
@supports not (display: flex) {
  .slide {
    display: block;
  }
}
```

---

### Responsive Design

**Breakpoints:**
```css
/* Desktop */
@media (min-width: 1024px) {
  /* Full layouts */
}

/* Tablet */
@media (min-width: 768px) and (max-width: 1023px) {
  /* Adjusted layouts */
}

/* Mobile */
@media (max-width: 767px) {
  /* Stacked layouts */
}
```

**Mobile considerations:**
- Single column layouts
- Larger touch targets (44x44px minimum)
- Simplified navigation
- Swipe gestures

---

### Accessibility (WCAG 2.1 AA)

**Color contrast:**
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- Large text = 18px+ bold or 24px+ regular

**Keyboard navigation:**
- All features accessible via keyboard
- Visible focus indicators
- Logical tab order
- Skip to main content link

**Screen reader support:**
```html
<!-- Use semantic HTML -->
<nav aria-label="Slide navigation">
  <button aria-label="Previous slide">←</button>
  <span aria-live="polite">Slide 1 of 10</span>
  <button aria-label="Next slide">→</button>
</nav>
```

**Alternative text:**
```html
<img src="chart.png" alt="Bar chart showing 40% increase in efficiency">
```

---

## Delivery Best Practices

### Practice Your Timing

**Guidelines:**
- **1-2 minutes** per slide average
- **10-20 minutes** total presentation
- **5 minutes** Q&A time

**Time your practice:**
- Use a timer
- Note which slides take longer
- Adjust content or practice more
- Build in buffer time

---

### Prepare for Technical Issues

**Backup plan:**
- Save PDF version
- Have offline copy
- Test on presentation computer
- Bring adapter cables

**Common issues:**
- **Projector not working:** Use PDF backup
- **Internet down:** Use offline version
- **Audio issues:** Test beforehand
- **Font missing:** Use web fonts or system fonts

---

### Speaker Notes

**Include notes for:**
- Key talking points
- Transition phrases
- Timing reminders
- Audience engagement cues

**Format:**
```html
<div class="speaker-notes" aria-hidden="true">
  <h3>Speaker Notes</h3>
  <ul>
    <li>Emphasize the 40% efficiency increase</li>
    <li>Share customer testimonial here</li>
    <li>Transition to next slide with "Let's see how..."</li>
  </ul>
</div>
```

**View notes:**
- Use presenter view (if available)
- Print notes beforehand
- Use dual monitor setup

---

### Audience Engagement

**Techniques:**
- **Ask questions:** "How many of you have...?"
- **Use polls:** Interactive engagement
- **Tell stories:** Relatable examples
- **Show, don't tell:** Visual demonstrations
- **Pause for effect:** Let points sink in

**Avoid:**
- Reading slides verbatim
- Turning back to audience
- Speaking too fast
- Using jargon without explanation

---

## Common Mistakes to Avoid

### Content Mistakes

❌ **Too much text**
✅ Use visuals, speak the details

❌ **Cluttered slides**
✅ One idea per slide, generous whitespace

❌ **Inconsistent style**
✅ Create and follow a style guide

❌ **Poor grammar/typos**
✅ Proofread multiple times

---

### Design Mistakes

❌ **Low contrast**
✅ Ensure 4.5:1 contrast minimum

❌ **Too many colors**
✅ Use 3-4 colors maximum

❌ **Small fonts**
✅ 18px minimum for body text

❌ **Poor image quality**
✅ Use high-resolution, optimized images

---

### Technical Mistakes

❌ **No keyboard controls**
✅ Implement arrow key navigation

❌ **Not responsive**
✅ Test on mobile devices

❌ **Large file sizes**
✅ Optimize images and code

❌ **No accessibility**
✅ Follow WCAG guidelines

---

### Layout Mistakes

❌ **横向多卡片排列导致留白过多**
✅ 改用纵向排列，提升信息密度

❌ **步骤分散展示（每步骤一页）**
✅ 合并为单页，精简每步为核心要素

❌ **页面过多导致信息碎片化**
✅ 控制页数在合理范围（14-22页为佳）

❌ **clamp() 最小字体小于 16px**
✅ 所有 clamp 最小值 ≥ 1rem (16px)

---

### 页数优化原则

- **合理页数范围：14-22页**（过多则碎片化，过少则信息不足）
- **每章至少2页**（满足章节完整度）
- **单页高度≤100vh**（不依赖整页纵向滚动）
- **合并页需精简内容**（保留核心要素，删除冗余）

---

### 布局优化原则

| 场景 | 优化方向 |
|------|---------|
| 多卡片并列（4+） | 横向→纵向排列 |
| 多步骤分散 | 合并为单页，每步精简为关键要素 |
| 信息密度低 | 减少留白，紧凑但不拥挤 |

---

### Delivery Mistakes

❌ **Reading slides**
✅ Use slides as visual aids, speak naturally

❌ **Speaking too fast**
✅ Practice timing, pause for emphasis

❌ **No practice**
✅ Rehearse multiple times

❌ **No backup**
✅ Save PDF version, test equipment

---

## Quick Checklist

### Before Creating
- [ ] Define audience and purpose
- [ ] Outline key messages
- [ ] Plan visual hierarchy
- [ ] Choose color palette
- [ ] Select fonts

### During Creation
- [ ] One idea per slide
- [ ] Minimal text (40-50 words max)
- [ ] High-quality visuals
- [ ] Consistent styling
- [ ] Proper contrast

### Before Presentation
- [ ] Practice timing
- [ ] Test on multiple browsers
- [ ] Check accessibility
- [ ] Create PDF backup
- [ ] Test equipment

### During Presentation
- [ ] Engage audience
- [ ] Speak naturally
- [ ] Maintain eye contact
- [ ] Use speaker notes
- [ ] Stay on time

---

## Resources

### Design Inspiration
- **Slideshare:** Browse popular presentations
- **Dribbble:** UI/UX design inspiration
- **Behance:** Creative presentation examples
- **Pinterest:** Visual ideas and layouts

### Tools
- **Canva:** Quick design templates
- **Figma:** Professional design tool
- **Google Slides:** Collaborative editing
- **PowerPoint:** Traditional option

### Learning
- **TED Talks:** Great presentation examples
- **Presentation Zen:** Book by Garr Reynolds
- **Slide:ology:** Book by Nancy Duarte
- **Resonate:** Book by Nancy Duarte

---

## Remember

**Great presentations =**
- Clear message
- Simple design
- Engaging delivery
- Technical excellence

**Your goal:** Help your audience understand and remember your message.
