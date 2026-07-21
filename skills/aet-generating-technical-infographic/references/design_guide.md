# Design Guidelines

## Color Scheme

### Default Tech Theme

| Role | Value | Description |
|------|-------|-------------|
| Primary | #007AFF | Apple blue, theme accent |
| Background | #0A0A1A | Dark sci-fi background |
| Secondary BG | #1A1A2E | Cards, section backgrounds |
| Card BG | #232338 | Inner card backgrounds |
| Accent | #00D4FF | Highlights, icons |
| Success | #34C759 | Pros indicator |
| Danger | #FF3B30 | Cons indicator |
| Text Primary | #FFFFFF | Titles, important text |
| Text Secondary | #A0A0B0 | Descriptive text |

### Alternative Theme Colors

Users can customize the theme color; the system automatically computes RGB values and generates matching gradients.

| Theme | Value | Style |
|-------|-------|-------|
| Tech Blue | #007AFF | Modern, tech |
| Geek Green | #00C853 | Vitality, innovation |
| Flame Orange | #FF6B35 | Energy, passion |
| Rose Gold | #E91E63 | Fashion, elegance |
| Night Purple | #9C27B0 | Mystery, premium |
| Amber Yellow | #FFC107 | Warmth, warning |

## Typography

### Font Hierarchy

| Element | Size (Vertical) | Size (Horizontal) | Weight |
|---------|-----------------|-------------------|--------|
| Title | 42px | 56px | 700 |
| Subtitle | 20px | 24px | 400 |
| Section Title | 22px | 20px | 600 |
| Concept Name | 18px | 15px | 600 |
| Body | 15-18px | 13-16px | 400 |
| Auxiliary | 13px | 12px | 400 |

### Spacing System

| Element | Vertical | Horizontal |
|---------|----------|------------|
| Page Margin | 32px | 40px |
| Section Gap | 28px | 32px |
| Card Gap | 16px | 12px |
| Padding | 24px | 24px |
| Border Radius | 20px | 20px |

## Component Guidelines

### Cards

- Background: `bg-card (#232338)`
- Border radius: 16px
- Padding: 18px (vertical) / 14px (horizontal)
- Border: 1px solid rgba(255,255,255,0.06)

### Icon Badges

- Size: 44x44px (vertical) / 40x40px (horizontal)
- Border radius: 12px
- Background: Theme color gradient
- Font size: 24px

### Flowchart Arrows

- Arrow: CSS-drawn triangle
- Color: Theme color
- Spacing: 12px

### Comparison Table

- Pros column: Green gradient bg rgba(52,199,89,0.15)
- Cons column: Red gradient bg rgba(255,59,48,0.15)
- Border: 1px solid 30% opacity of respective color

### Block Quotes

- Background: Theme color at 10% opacity
- Border: 1px dashed theme color at 40% opacity
- Quote mark: 60px Georgia serif, theme color at 30% opacity

## Dimension Specifications

### Vertical Long Image

- Width: 540px (rendered as 1080px@2x)
- Height: Auto-adaptive
- Min height: 1920px
- Use: Phone wallpapers, social media

### Horizontal Banner

- Width: 960px (rendered as 1920px@2x)
- Height: 540px (rendered as 1080px@2x)
- Use: PPT slides, article covers

## Animation Effects

### Header Glow

```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
}
```

### Gradient Background

- Type: radial-gradient
- Color: From theme color at 20% opacity to transparent
- Animation: Continuous pulsing expansion

## Accessibility

- Ensure text-to-background contrast ratio >= 4.5:1
- Theme color auto-adjusts for readability
- Avoid conveying information through color alone
