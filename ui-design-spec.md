# UI Design Specification

## 1. Color System

### 1.1 Color Space
All colors defined in **OKLCH** color space for perceptual uniformity.

### 1.2 Core Palette (CSS Custom Properties)

```css
:root {
  /* Theme Hue: 190 (cyan-teal) */
  --hue: 190;

  /* Primary Brand Color */
  --primary: oklch(0.70 0.14 var(--hue));

  /* Light Theme */
  --page-bg: oklch(0.95 0.01 var(--hue));
  --card-bg: white;
  --card-bg-transparent: rgb(255 255 255 / var(--card-transparent-opacity, 0.6));

  --btn-content: oklch(0.55 0.12 var(--hue));
  --btn-regular-bg: oklch(0.95 0.025 var(--hue));
  --btn-regular-bg-hover: oklch(0.90 0.05 var(--hue));
  --btn-regular-bg-active: oklch(0.85 0.08 var(--hue));

  --btn-plain-bg-hover: oklch(0.95 0.025 var(--hue));
  --btn-plain-bg-active: oklch(0.98 0.01 var(--hue));

  --btn-card-bg-hover: oklch(0.98 0.005 var(--hue));
  --btn-card-bg-active: oklch(0.90 0.03 var(--hue));

  --deep-text: oklch(0.25 0.02 var(--hue));
  --title-active: oklch(0.60 0.10 var(--hue));

  --line-divider: rgba(0, 0, 0, 0.08);
  --line-color: rgba(0, 0, 0, 0.1);
  --meta-divider: rgba(0, 0, 0, 0.2);
  --content-meta: rgba(0, 0, 0, 0.7);

  --inline-code-bg: var(--btn-regular-bg);
  --inline-code-color: var(--btn-content);
  --muted: oklch(0.93 0.015 var(--hue));
  --selection-bg: oklch(0.90 0.05 var(--hue));
  --codeblock-bg: oklch(0.17 0.015 var(--hue));
  --codeblock-topbar-bg: oklch(0.30 0.02 var(--hue));

  --link-underline: oklch(0.93 0.04 var(--hue));
  --link-hover: oklch(0.95 0.025 var(--hue));
  --link-active: oklch(0.90 0.05 var(--hue));

  --float-panel-bg: white;
}

/* Dark Theme */
:root.dark {
  --primary: oklch(0.75 0.14 var(--hue));
  --page-bg: oklch(0.16 0.014 var(--hue));
  --card-bg: oklch(0.23 0.015 var(--hue));
  --card-bg-transparent: rgb(23 23 23 / var(--card-transparent-opacity, 0.6));

  --btn-content: oklch(0.75 0.10 var(--hue));
  --btn-regular-bg: oklch(0.33 0.035 var(--hue));
  --btn-regular-bg-hover: oklch(0.38 0.04 var(--hue));
  --btn-regular-bg-active: oklch(0.43 0.045 var(--hue));

  --btn-plain-bg-hover: oklch(0.30 0.035 var(--hue));
  --btn-plain-bg-active: oklch(0.27 0.025 var(--hue));

  --btn-card-bg-hover: oklch(0.30 0.03 var(--hue));
  --btn-card-bg-active: oklch(0.35 0.035 var(--hue));

  --line-divider: rgba(255, 255, 255, 0.08);
  --line-color: rgba(255, 255, 255, 0.1);
  --meta-divider: rgba(255, 255, 255, 0.2);
  --content-meta: rgba(255, 255, 255, 0.6);

  --muted: oklch(0.25 0.015 var(--hue));
  --selection-bg: oklch(0.40 0.08 var(--hue));
  --codeblock-bg: oklch(0.17 0.015 var(--hue));
  --codeblock-topbar-bg: oklch(0.12 0.015 var(--hue));

  --link-underline: oklch(0.40 0.08 var(--hue));
  --link-hover: oklch(0.40 0.08 var(--hue));
  --link-active: oklch(0.35 0.07 var(--hue));

  --float-panel-bg: oklch(0.19 0.015 var(--hue));
}
```

### 1.3 Theme Color Selector Gradient
```css
--color-selection-bar: linear-gradient(
  to right,
  oklch(0.80 0.10 0), oklch(0.80 0.10 30), oklch(0.80 0.10 60),
  oklch(0.80 0.10 90), oklch(0.80 0.10 120), oklch(0.80 0.10 150),
  oklch(0.80 0.10 180), oklch(0.80 0.10 210), oklch(0.80 0.10 240),
  oklch(0.80 0.10 270), oklch(0.80 0.10 300), oklch(0.80 0.10 330),
  oklch(0.80 0.10 360)
);
```

### 1.4 Admonition Colors
```css
--admonitions-color-tip: oklch(0.70 0.14 180);
--admonitions-color-note: oklch(0.70 0.14 250);
--admonitions-color-important: oklch(0.70 0.14 310);
--admonitions-color-warning: oklch(0.70 0.14 60);
--admonitions-color-caution: oklch(0.60 0.20 25);
```

---

## 2. Typography

### 2.1 Font Stack
```css
@theme {
  --font-sans:
    'Zen Maru Gothic', 'Inter', ui-sans-serif, system-ui, sans-serif,
    'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

### 2.2 Font Definitions (Astro Font API)
| Font | CSS Variable | Weights | Use Case |
|------|-------------|---------|----------|
| Zen Maru Gothic | `--font-zen-maru-gothic` | 300-700 | Display, headings, banner titles |
| Inter | `--font-inter` | 300-700 | Body text, UI labels |
| JetBrains Mono | `--font-jetbrains-mono` | 400, 700 | Code blocks, monospace |

### 2.3 Font Assignment
```css
:root {
  --font-banner-title: var(--font-zen-maru-gothic);
  --font-banner-subtitle: var(--font-inter);
  --font-navbar-title: var(--font-zen-maru-gothic);
  --font-code: var(--font-jetbrains-mono);
}
```

---

## 3. Spacing System

```css
:root {
  /* Base spacing (4px unit) */
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 0.75rem;   /* 12px */
  --spacing-lg: 1rem;      /* 16px */
  --spacing-xl: 1.25rem;   /* 20px */
  --spacing-2xl: 1.5rem;   /* 24px */
  --spacing-3xl: 2rem;     /* 32px */
  --spacing-4xl: 2.5rem;   /* 40px */
  --spacing-5xl: 3rem;     /* 48px */

  /* Component gaps */
  --widget-gap-mobile: var(--spacing-md);
  --widget-gap-tablet: var(--spacing-lg);
  --widget-gap-desktop: var(--spacing-xl);
}
```

---

## 4. Border Radius

```css
:root {
  --radius-sm: 0.25rem;   /* 4px */
  --radius-md: 0.375rem;  /* 6px */
  --radius-lg: 0.5rem;    /* 8px */
  --radius-xl: 0.75rem;   /* 12px */
  --radius-2xl: 1rem;     /* 16px */
  --radius-3xl: 1.5rem;   /* 24px */
  --radius-full: 9999px;
  --radius-large: 0;      /* Global override (0 = sharp corners) */
}
```

---

## 5. Shadow System

```css
:root {
  /* Elevation shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.10);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.10);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.10);
  --shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25);

  /* Component-specific */
  --shadow-navbar: 0 4px 16px rgba(0, 0, 0, 0.10);
  --shadow-navbar-dark: 0 4px 16px rgba(0, 0, 0, 0.20);
  --shadow-button: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-button-dark: 0 4px 12px rgba(255, 255, 255, 0.10);
}
```

---

## 6. Animation & Transitions

### 6.1 Easing Functions
```css
:root {
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-decelerate: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-accelerate: cubic-bezier(0.55, 0.055, 0.675, 0.19);
  --ease-sharp: cubic-bezier(0.4, 0, 0.6, 1);
}
```

### 6.2 Durations
```css
:root {
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-medium: 200ms;
  --duration-slow: 250ms;
  --duration-slower: 300ms;
}
```

### 6.3 Delays
```css
:root {
  --delay-none: 0ms;
  --delay-short: 30ms;
  --delay-medium: 60ms;
  --delay-long: 90ms;
  --delay-longer: 120ms;
}
```

### 6.4 Global Transition Defaults
```css
.transition,
[class*="border"],
[class*="transition"] {
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: var(--ease-standard);
  transition-duration: var(--duration-normal);
}
```

### 6.5 View Transitions (Page Theme Switch)
```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 500ms;
  animation-timing-function: var(--ease-standard);
  mix-blend-mode: normal;
}

::view-transition-group(root) {
  animation-duration: 500ms;
  animation-timing-function: var(--ease-standard);
}

@keyframes theme-fade-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes theme-fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
```

---

## 7. Breakpoints & Layout

### 7.1 Breakpoints
```css
:root {
  --breakpoint-xs: 320px;
  --breakpoint-sm: 480px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}
```

### 7.2 Container Widths
```css
:root {
  --container-xs: 100%;
  --container-sm: 100%;
  --container-md: 100%;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1536px;
}
```

### 7.3 Sidebar Widths
```css
:root {
  --sidebar-width-mobile: 100%;
  --sidebar-width-tablet: 280px;
  --sidebar-width-desktop: 320px;
}
```

### 7.4 Page Width
```css
:root {
  --page-width: 95rem;  /* Max content width */
}
```

### 7.5 Responsive Root Variables
```css
@media (max-width: 767px) {
  :root {
    --container-width: var(--container-sm);
    --widget-gap: var(--widget-gap-mobile);
    --sidebar-width: var(--sidebar-width-mobile);
  }
}

@media (min-width: 768px) and (max-width: 1279px) {
  :root {
    --container-width: var(--container-md);
    --widget-gap: var(--widget-gap-tablet);
    --sidebar-width: var(--sidebar-width-tablet);
  }
}

@media (min-width: 1280px) {
  :root {
    --container-width: var(--container-lg);
    --widget-gap: var(--widget-gap-desktop);
    --sidebar-width: var(--sidebar-width-desktop);
  }
}
```

---

## 8. Z-Index Scale

```css
:root {
  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-modal-backdrop: 1040;
  --z-modal: 1050;
  --z-popover: 1060;
  --z-tooltip: 1070;
  --z-toast: 1080;

  --z-navbar: 20;
  --z-banner: 10;
  --z-content: 30;
}
```

---

## 9. Component Patterns

### 9.1 Card System
```css
.card-base {
  border-radius: var(--radius-large);
  overflow: hidden;
  background-color: var(--card-bg);
  transition: background-color var(--duration-normal);
}

.card-base-transparent {
  border-radius: var(--radius-large);
  overflow: hidden;
  background-color: var(--card-bg-transparent);
  transition: background-color var(--duration-normal);
}

/* With border & shadow (opt-in via .enable-card-border on html/body) */
.enable-card-border .card-base,
.enable-card-border .card-base-transparent,
.enable-card-border .btn-card {
  border: 1px solid var(--line-divider);
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-slower);
}
```

### 9.2 Button Variants
```css
/* Ghost button */
.btn-plain {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  color: rgba(0, 0, 0, 0.75);
  transition: color var(--duration-normal);
}
.btn-plain:hover { color: var(--primary); }
:root.dark .btn-plain { color: rgba(255, 255, 255, 0.75); }
:root.dark .btn-plain:hover { color: var(--primary); }

/* With background on hover (non-scale) */
.btn-plain:not(.scale-animation):hover {
  background-color: var(--btn-plain-bg-hover);
}
.btn-plain:not(.scale-animation):active {
  background-color: var(--btn-plain-bg-active);
}

/* Scale animation variant */
.scale-animation::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transform: scale(0.85);
  z-index: -1;
  transition: all 150ms ease-out;
}
.scale-animation:hover::before,
.scale-animation:focus-visible::before {
  background-color: var(--btn-plain-bg-hover);
  transform: scale(1);
}
.scale-animation:active::before {
  background-color: var(--btn-plain-bg-active);
}

/* Solid primary button */
.btn-regular {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--btn-regular-bg);
  color: var(--btn-content);
  transition: background-color var(--duration-normal);
}
.btn-regular:hover { background-color: var(--btn-regular-bg-hover); }
.btn-regular:active { background-color: var(--btn-regular-bg-active); }

/* Card-surface button */
.btn-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  transition: background-color var(--duration-normal);
}
.btn-card:hover { background-color: var(--btn-card-bg-hover); }
.btn-card:active { background-color: var(--btn-card-bg-active); }
```

### 9.3 Floating Panel / Dropdown
```css
.float-panel {
  position: absolute;
  top: 5.25rem; /* top-21 */
  border-radius: var(--radius-large);
  overflow: hidden;
  background-color: var(--card-bg);
  transition: background-color var(--duration-normal);
  box-shadow: var(--shadow-xl);
  border: 1px solid rgba(0, 0, 0, 0.05);
}
:root.dark .float-panel {
  border-color: rgba(255, 255, 255, 0.10);
}

.float-panel-closed {
  transform: translateY(-0.25rem);
  opacity: 0;
  pointer-events: none;
}

.dropdown-content {
  background-color: var(--card-bg);
  border-radius: var(--radius-large);
  box-shadow: var(--shadow-xl);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 0.5rem;
  min-width: 12rem;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 200ms ease-out, transform 200ms ease-out, background-color var(--duration-normal), border-color var(--duration-normal);
}
.dropdown-container:hover .dropdown-content,
.dropdown-container:focus-within .dropdown-content {
  opacity: 1;
  transform: translateY(0);
}
```

### 9.4 Link Underline Style
```css
.link-underline {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-decoration-style: dashed;
  text-decoration-color: var(--link-underline);
  text-underline-offset: 0.25rem;
  transition: text-decoration-color var(--duration-normal);
}
.link-underline:hover { text-decoration-color: var(--link-hover); }
.link-underline:active { text-decoration-color: var(--link-active); }
```

### 9.5 Focus Ring (Accessibility)
```css
:where(
  a[href], button, input, select, textarea,
  summary, [contenteditable="true"],
  [tabindex]:not([tabindex="-1"])
):focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.focus-ring-inset:focus-visible {
  outline-offset: -2px;
}
```

### 9.6 Text Opacity Utilities
```css
.text-90 { color: rgba(0, 0, 0, 0.90); }
:root.dark .text-90 { color: rgba(255, 255, 255, 0.90); }

.text-75 { color: rgba(0, 0, 0, 0.75); }
:root.dark .text-75 { color: rgba(255, 255, 255, 0.75); }

.text-50 { color: rgba(0, 0, 0, 0.50); }
:root.dark .text-50 { color: rgba(255, 255, 255, 0.50); }

.text-30 { color: rgba(0, 0, 0, 0.30); }
:root.dark .text-30 { color: rgba(255, 255, 255, 0.30); }

.text-25 { color: rgba(0, 0, 0, 0.25); }
:root.dark .text-25 { color: rgba(255, 255, 255, 0.25); }
```

---

## 10. Wallpaper / Background Modes

### 10.1 Mode Definitions
| Mode | Description | Key Variables |
|------|-------------|---------------|
| `none` | Solid color background | `--page-bg` |
| `banner` | Top banner image with gradient fade | `--banner-height-home`, `--banner-height-non-home` |
| `fullscreen` | Hero full-screen, content below | `--navbar-glass-blur`, dynamic transparent |
| `overlay` | Full-screen transparent overlay | `--card-transparent-opacity`, `--card-bg-transparent` |

### 10.2 Navbar Transparency Modes
```css
/* Semi-transparent */
#navbar[data-transparent-mode="semi"] > div {
  background-color: var(--card-bg-transparent);
  backdrop-filter: blur(var(--navbar-glass-blur, 5px));
}

/* Dynamic: transparent at top, solid on scroll */
html[data-wallpaper-mode="fullscreen"]
#navbar[data-transparent-mode="semifull"]:not(.scrolled) > div {
  background: transparent;
  backdrop-filter: none;
  box-shadow: none;
}

/* Override borders in fullscreen mode */
html[data-wallpaper-mode="fullscreen"] #navbar > div {
  border: none !important;
  outline: none !important;
}
```

### 10.3 Gradient Fade (Banner Mode)
```css
.top-gradient-highlight {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 180px;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.50) 0%,
    rgba(255,255,255,0.30) 30%,
    rgba(255,255,255,0.15) 60%,
    rgba(255,255,255,0.05) 80%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 20;
}
:root.dark .top-gradient-highlight {
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0.50) 0%,
    rgba(0,0,0,0.30) 30%,
    rgba(0,0,0,0.15) 60%,
    rgba(0,0,0,0.05) 80%,
    transparent 100%
  );
}
```

---

## 11. Effects & Decorative Layers

### 11.1 Ripple / Click Effect (Blue Archive Style)
```css
/* Config-driven via CSS variables */
--ba-click-scale: 0.65;
--ba-click-opacity: 0.4;
--ba-click-theme-color: #00b9b2; /* fallback, overridden by --primary at runtime */
--ba-click-isolated-compositing: true;
--ba-click-light-contrast-alpha: 0.2;
```

### 11.2 Waves Animation (Canvas)
- Desktop/mobile toggleable
- Performance cost: ~33KB/page when enabled

---

## 12. Performance Optimizations

### 12.1 Theme Transition Guards
```css
/* Disable transitions during theme switch (non-View-Transitions fallback) */
.is-theme-transitioning:not(.use-view-transition) *,
.is-theme-transitioning:not(.use-view-transition) *::before,
.is-theme-transitioning:not(.use-view-transition) *::after {
  transition: none !important;
  animation: none !important;
}

/* Code blocks: always disable during theme transition */
.is-theme-transitioning .expressive-code,
.is-theme-transitioning .expressive-code * {
  transition: none !important;
  animation: none !important;
  will-change: auto !important;
}

/* Contain layout for stable rendering */
.is-theme-transitioning:not(.use-view-transition) .post-card,
.is-theme-transitioning:not(.use-view-transition) .widget,
.is-theme-transitioning:not(.use-view-transition) .float-panel {
  contain: layout style paint !important;
}
```

### 12.2 GPU Acceleration
```css
:root {
  --gpu-transform: translateZ(0);
  --gpu-backface: hidden;
}
```

### 12.3 LQIP (Low Quality Image Placeholders)
```css
.lqip-placeholder {
  z-index: 0;
  transition: opacity 500ms ease-out;
}
.lqip-placeholder.loaded {
  opacity: 0;
}
```

---

## 13. Scrollbar Styling

```css
:root {
  --scrollbar-bg-light: rgba(0, 0, 0, 0.40);
  --scrollbar-bg-hover-light: rgba(0, 0, 0, 0.50);
  --scrollbar-bg-active-light: rgba(0, 0, 0, 0.60);

  --scrollbar-bg-dark: rgba(255, 255, 255, 0.40);
  --scrollbar-bg-hover-dark: rgba(255, 255, 255, 0.50);
  --scrollbar-bg-active-dark: rgba(255, 255, 255, 0.60);

  --scrollbar-bg: var(--scrollbar-bg-light);
  --scrollbar-bg-hover: var(--scrollbar-bg-hover-light);
  --scrollbar-bg-active: var(--scrollbar-bg-active-light);
}
:root.dark {
  --scrollbar-bg: var(--scrollbar-bg-dark);
  --scrollbar-bg-hover: var(--scrollbar-bg-hover-dark);
  --scrollbar-bg-active: var(--scrollbar-bg-active-dark);
}

.hide-scrollbar {
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
```

---

## 14. Selection Style

```css
::selection {
  background-color: var(--selection-bg);
}
```

---

## 15. Spoiler / Reveal Pattern

```css
.custom-md spoiler {
  --_spoiler-mask: var(--primary);
  border-radius: var(--radius-md);
  padding: 0 0.25rem;
  background-color: var(--_spoiler-mask);
  box-decoration-break: clone;
  transition: all var(--duration-normal);
}

.custom-md spoiler:not(:hover) {
  color: transparent;
}
.custom-md spoiler:not(:hover) * {
  opacity: 0;
}

/* Light mode: lighter mask */
:root:not(.dark) .custom-md spoiler {
  --_spoiler-mask: color-mix(in oklch, var(--primary) 55%, white 45%);
}
```

---

## 16. Icon System

- **Provider**: Iconify (SVG `<symbol>` + `<use>`)
- **Inline sizing**: `height: 1em; width: 1em;`
- **Theme-aware**: `currentColor` fill inherits text color
- **Light/Dark variants**: `--display-light-icon` / `--display-dark-icon` (0/1) for CSS-only switching

---

## 17. Print & Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

@media print {
  .float-panel,
  .dropdown-content,
  #navbar,
  .floating-btn {
    display: none !important;
  }
}
```

---

## 18. Configuration Toggle Matrix

| Feature | CSS Class / Attribute | Default |
|---------|----------------------|---------|
| Card borders & shadows | `.enable-card-border` on `<html>` | `true` |
| Card follows theme hue | `.card-follow-theme-hue` on `<body>` | `true` |
| Wallpaper mode | `html[data-wallpaper-mode="..."]` | `none` |
| Waves enabled | `html[data-waves-enabled="true"]` | `true` (desktop) |
| Gradient fade | `html[data-gradient-enabled="true"]` | `true` |
| Banner title | `html[data-banner-title-enabled="true"]` | `true` |
| BA click effect | `html[data-ba-click-enabled="true"]` | `true` |
| BA trail effect | `html[data-ba-trail-enabled="true"]` | `true` |

---

## 19. Implementation Notes

1. **Zero-runtime config**: All visual toggles controlled via CSS classes on `<html>`/`<body>` or data-attributes — no JS required for styling.
2. **View Transitions first**: Theme/page transitions use View Transitions API; CSS fallbacks only for non-supporting browsers.
3. **OKLCH everywhere**: Ensures consistent lightness/chroma across hue shifts.
4. **No hardcoded colors**: Every color references a semantic variable.
5. **Sharp corners by default**: `--radius-large: 0` — override for rounded aesthetic.
6. **Font loading**: Astro Font API with `font-display: swap` and subsetting.
7. **Image optimization**: WebP only (configurable), responsive widths, LQIP gradients.

---

*Generated from Firefly theme analysis — context-free UI design system.*