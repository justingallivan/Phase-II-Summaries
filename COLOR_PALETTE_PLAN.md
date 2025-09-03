# Color Palette & Design System Plan

## Current State ✅
- **Neutral foundation established**: Clean gray/white layouts
- **Layout system in place**: Consistent spacing, typography, components
- **Structure-first approach**: Focus on usability and hierarchy
- **Find Reviewers page migrated**: Proof of concept complete

## Color Palette Strategy

### 1. Primary Color Scheme
**Academic Blue** - Professional, trustworthy, scientific
- `primary-50`: `#eff6ff` - Light backgrounds
- `primary-100`: `#dbeafe` - Subtle highlights  
- `primary-200`: `#bfdbfe` - Borders, dividers
- `primary-300`: `#93c5fd` - Disabled states
- `primary-400`: `#60a5fa` - Secondary actions
- `primary-500`: `#3b82f6` - Default primary
- `primary-600`: `#2563eb` - Primary buttons
- `primary-700`: `#1d4ed8` - Hover states
- `primary-800`: `#1e40af` - Active states
- `primary-900`: `#1e3a8a` - Dark accents

### 2. Secondary Color Scheme  
**Success Green** - Positive actions, completion
- `secondary-50`: `#f0fdf4` - Success backgrounds
- `secondary-100`: `#dcfce7` - Light success
- `secondary-200`: `#bbf7d0` - Borders
- `secondary-500`: `#22c55e` - Success text
- `secondary-600`: `#16a34a` - Success buttons
- `secondary-700`: `#15803d` - Hover states

### 3. Accent Colors
**Research Purple** - Special features, advanced options
- `accent-50`: `#faf5ff` - Light backgrounds
- `accent-100`: `#f3e8ff` - Subtle highlights
- `accent-500`: `#a855f7` - Accent elements
- `accent-600`: `#9333ea` - Accent buttons
- `accent-700`: `#7c3aed` - Hover states

### 4. Status Colors
- **Warning**: `amber-50` to `amber-600` - Caution, pending states
- **Error**: `red-50` to `red-600` - Errors, dangerous actions
- **Info**: `sky-50` to `sky-600` - Information, tips

### 5. Neutral Colors (Keep Current)
- `gray-50` to `gray-900` - Text, backgrounds, borders

## Application Strategy

### Phase 1: Component Updates
Update shared components with color variables:

```css
/* Add to globals.css */
:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-secondary: #16a34a;
  --color-accent: #9333ea;
}

/* Component classes */
.btn-primary {
  @apply bg-primary-600 hover:bg-primary-700 text-white;
}

.btn-secondary {
  @apply bg-secondary-600 hover:bg-secondary-700 text-white;
}
```

### Phase 2: Page-by-Page Migration
1. **Landing Page** - Add primary gradient, accent cards
2. **Find Reviewers** - Apply primary/secondary buttons
3. **Other Pages** - Follow established patterns

### Phase 3: Advanced Features
- **Status indicators** with appropriate colors
- **Interactive states** with consistent hover/focus
- **Dark mode support** (optional)

## Color Usage Guidelines

### Navigation & Header
- Background: `white` with `gray-200` borders
- Logo/Brand: `primary-600`
- Navigation links: `gray-600` → `primary-600` on hover
- Active page: `primary-600` with `primary-100` background

### Buttons & Actions
- **Primary actions**: `primary-600` (Search, Submit, etc.)
- **Secondary actions**: `gray-100` with `gray-900` text
- **Success actions**: `secondary-600` (Save, Complete)
- **Destructive actions**: `red-600` (Delete, Remove)

### Cards & Containers  
- **Default cards**: `white` with `gray-200` borders
- **Interactive cards**: Hover to `gray-50` with `gray-300` borders
- **Success states**: `secondary-50` background, `secondary-200` border
- **Warning states**: `amber-50` background, `amber-200` border
- **Error states**: `red-50` background, `red-200` border

### Form Elements
- **Inputs**: `gray-300` border → `primary-500` focus ring
- **Labels**: `gray-700` text
- **Helper text**: `gray-500` text
- **Required fields**: `red-500` asterisk

### Status Indicators
- **Available/Active**: `secondary-600` (green)
- **Coming Soon**: `amber-600` (yellow)
- **Processing**: `primary-600` (blue)
- **Error**: `red-600` (red)
- **Success**: `secondary-600` (green)

## Implementation Benefits

### Consistency
- All pages follow same color rules
- Easy to maintain and update
- Professional, cohesive appearance

### Accessibility  
- High contrast ratios for readability
- Color-blind friendly palette
- Semantic color meanings

### Scalability
- Easy to add new features
- Theme-able architecture
- Future dark mode support

## Tools & Utilities

### Tailwind Config Update
```js
theme: {
  extend: {
    colors: {
      primary: {
        50: '#eff6ff',
        // ... full scale
        900: '#1e3a8a'
      }
    }
  }
}
```

### CSS Custom Properties
```css
:root {
  --color-brand: theme('colors.primary.600');
  --color-success: theme('colors.secondary.600');
  --color-warning: theme('colors.amber.600');
  --color-error: theme('colors.red.600');
}
```

## Next Steps

1. **Update Tailwind config** with new color palette
2. **Update globals.css** with component utilities  
3. **Apply colors systematically** starting with Layout component
4. **Test accessibility** and contrast ratios
5. **Document color usage** for future developers

## Visual Hierarchy

### Text Colors
- **Headings**: `gray-900` (darkest)
- **Body text**: `gray-700` (readable)
- **Helper text**: `gray-500` (subtle)
- **Disabled text**: `gray-400` (muted)

### Background Hierarchy
- **Page background**: `gray-50` (light)
- **Card background**: `white` (clean)
- **Interactive areas**: `gray-25` hover (subtle)
- **Active areas**: `primary-50` (branded)

This plan provides a systematic approach to applying colors while maintaining the excellent layout foundation we've built!