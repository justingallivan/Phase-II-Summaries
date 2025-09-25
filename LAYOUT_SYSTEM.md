# Layout System Documentation

## Design Principles

### 1. Layout-First Approach
- Focus on structure, spacing, and hierarchy before colors
- Use neutral grays and whites for initial implementation
- Apply colors systematically as the final step

### 2. Component-Based Architecture
- Reusable layout components for consistency
- Shared utilities for common patterns
- Easy to maintain and update globally

### 3. Common Layout Patterns Identified

#### Page Structure (All Pages):
```
Header (with navigation)
├── Page Title Section
├── Configuration Section (API keys, settings)
├── Input Section (file upload, forms)
├── Action Buttons
├── Progress/Loading States
├── Results Section
└── Footer
```

#### Spacing System:
- Container max-width: `max-w-6xl` or `max-w-7xl`
- Section padding: `py-8` or `py-12`
- Card padding: `p-6`
- Element gaps: `gap-4`, `gap-6`, `gap-8`

#### Typography Hierarchy:
- Page titles: `text-3xl md:text-4xl font-bold`
- Section headers: `text-xl md:text-2xl font-semibold`
- Body text: `text-base leading-relaxed`
- Helper text: `text-sm text-gray-600`

## Shared Components Created

### 1. Layout Component
- **Purpose**: Consistent page structure across all apps
- **Props**: `title`, `description`, `showNavigation`, `maxWidth`
- **Features**: Responsive header, navigation, footer

### 2. PageHeader Component  
- **Purpose**: Consistent page titles with icons and descriptions
- **Props**: `title`, `subtitle`, `icon`, `children`
- **Features**: Centered layout, responsive typography

### 3. Card Component
- **Purpose**: Consistent container styling
- **Props**: `hover`, `padding`, `className`
- **Features**: Border, shadow, hover states

### 4. Button Component
- **Purpose**: Standardized button styling
- **Props**: `variant`, `size`, `disabled`, `loading`
- **Features**: Multiple variants, loading states

## Color Strategy (To Be Applied Later)

### Neutral Base Colors (Current):
- Background: `bg-gray-50`
- Cards: `bg-white`
- Borders: `border-gray-200`
- Text: `text-gray-900`, `text-gray-600`
- Buttons: `bg-gray-900`, `hover:bg-gray-800`

### Future Color System:
- Primary: Blue scale for main actions
- Secondary: Green scale for success states
- Accent: Purple/indigo for special elements
- Status: Amber for warnings, red for errors

## Implementation Strategy

### Phase 1: ✅ Layout Structure
- [x] Create shared Layout component
- [x] Define component library (Card, Button, PageHeader)
- [x] Establish neutral color scheme

### Phase 2: 🔄 Page Migration
- [ ] Convert Find Reviewers page to use Layout
- [ ] Convert other pages one by one
- [ ] Test responsive behavior

### Phase 3: 🔲 Color Application
- [ ] Define comprehensive color palette
- [ ] Create color utility classes
- [ ] Apply colors systematically across all components

### Phase 4: 🔲 Polish
- [ ] Add animations and micro-interactions
- [ ] Optimize mobile experience
- [ ] Add dark mode support (optional)

## Usage Examples

### Basic Page Layout:
```jsx
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';

export default function MyPage() {
  return (
    <Layout title="My Page" description="Page description">
      <PageHeader 
        title="Page Title" 
        subtitle="Page description"
        icon="🔍" 
      />
      
      <Card>
        <h2>Section Title</h2>
        <p>Content here</p>
        <Button variant="primary">Action</Button>
      </Card>
    </Layout>
  );
}
```

### Form Section Pattern:
```jsx
<Card className="mb-6">
  <div className="space-y-6">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Label
      </label>
      <input className="input-field" />
    </div>
    <Button variant="primary" loading={isProcessing}>
      Submit
    </Button>
  </div>
</Card>
```

## Benefits of This Approach

1. **Consistency**: All pages follow the same patterns
2. **Maintainability**: Change once, apply everywhere  
3. **Scalability**: Easy to add new pages or features
4. **Flexibility**: Colors can be changed globally
5. **Developer Experience**: Clear patterns to follow

## Next Steps

1. Migrate Find Reviewers page to use new Layout system
2. Create form utility components for common patterns
3. Test responsive behavior across devices
4. Plan comprehensive color palette
5. Apply colors systematically in final phase