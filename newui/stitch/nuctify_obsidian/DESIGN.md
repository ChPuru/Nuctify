# Design System Document: The Immersive Sonic Experience

## 1. Overview & Creative North Star: "The Neon Nocturne"
This design system is built to transform music streaming from a utility into a high-end cinematic event. Our Creative North Star is **"The Neon Nocturne"**—a philosophy where the interface feels like a sophisticated, high-tech lounge at midnight. 

We break the "template" look by rejecting rigid, boxy layouts in favor of **Organic Asymmetry** and **Tonal Depth**. By utilizing edge-to-edge imagery and overlapping glass layers, we create a rhythmic flow that mimics the music itself. The goal is an interface that doesn't just hold content but breathes with it.

---

## 2. Colors & Atmospheric Depth
Our palette is rooted in the void (`background: #0e0e13`), allowing our vibrant accents to vibrate against the darkness.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or layout containment. Boundaries must be defined strictly through:
- **Tonal Shifts:** Placing a `surface-container-high` element against a `surface` background.
- **Luminance Contrast:** Using the natural glow of a gradient to define an edge.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers of polished obsidian and frosted glass. 
- **Base:** `surface` (#0e0e13)
- **Floating Containers:** Use `surface-container-low` for large background regions and `surface-container-highest` for interactive cards to create "nested" depth.
- **The Glass & Gradient Rule:** For primary actions and the "Now Playing" bar, use a 45-degree linear gradient transitioning from `primary` (#ba9eff) to `secondary` (#53ddfc). Apply a `backdrop-filter: blur(24px)` to these elements to create the signature high-tech glass effect.

---

## 3. Typography: Editorial Rhythm
We pair the geometric precision of **Plus Jakarta Sans** for high-impact displays with the humanistic clarity of **Manrope** for navigation and details.

| Level | Token | Font | Size | Weight / Character |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Plus Jakarta Sans | 3.5rem | Bold, tight tracking (-2%) |
| **Headline** | `headline-md` | Plus Jakarta Sans | 1.75rem | Medium, wide-open breathing room |
| **Title** | `title-lg` | Manrope | 1.375rem | Semi-bold, authoritative |
| **Body** | `body-md` | Manrope | 0.875rem | Regular, high readability |
| **Label** | `label-sm` | Manrope | 0.6875rem | All-caps, +5% letter spacing |

**The Identity Gap:** Use extreme scale differences. A `display-lg` artist name should sit unapologetically large next to a very small, spaced-out `label-sm` metadata tag to create a premium editorial feel.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "web 2.0" for this system. We use light and transparency to simulate height.

*   **The Layering Principle:** Instead of shadows, stack surface tokens. A `surface-container-lowest` card placed on a `surface-container-low` background creates a "sunken" or "carved" aesthetic that feels integrated into the hardware.
*   **Ambient Shadows:** For floating elements (Modals/Context Menus), use a shadow color derived from `on-surface` at 6% opacity with a 40px blur. It should feel like a soft glow, not a dark stain.
*   **The Ghost Border:** If an element requires a container edge for accessibility, use `outline-variant` at **15% opacity**. It must be felt, not seen.
*   **Backdrop Blur:** Use a standard `20px` to `40px` blur on all glass layers to ensure legibility of text over edge-to-edge artist photography.

---

## 5. Components

### The "Glass" Button
*   **Primary:** Linear gradient (`primary` to `secondary`). No border. `xl` (1.5rem) roundedness. 
*   **Secondary:** `surface-container-highest` with a `Ghost Border`.
*   **States:** On hover, increase the `backdrop-filter` saturation; on tap, scale down to 0.98 for a tactile, "mechanical" feel.

### Immersive Artist Cards
*   **Rule:** Forbid divider lines.
*   **Style:** Edge-to-edge imagery with a `surface-container-lowest` gradient scrim at the bottom to house `title-md` text. Use `lg` (1rem) corner radius.

### The Rhythmic Progress Bar
*   **Track:** `surface-variant` at 30% opacity.
*   **Progress:** A vibrant gradient from `tertiary` (#ec63ff) to `primary` (#ba9eff).
*   **Knob:** Only visible on hover; a `full` rounded white glow.

### Interactive Chips
*   **Style:** `surface-container-high` background. When selected, use `primary-container` with `on-primary-container` text. Avoid outlines; use color-fill only.

### Input Fields
*   **Style:** Minimalist. No bottom line. Use a `surface-container-low` background with a `sm` radius. Typography should be `body-md`. Focus state is indicated by a subtle glow of the `secondary` color.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins (e.g., 24px left, 40px right) for hero sections to create a "custom-built" feel.
*   **Do** use ultra-wide letter spacing for `label` tokens to convey luxury.
*   **Do** allow artist photography to bleed behind the navigation bar using glassmorphism.

### Don't:
*   **Don't** use 100% opaque black (#000000) for backgrounds unless it is the `surface-container-lowest`. Use our deep charcoal `background` (#0e0e13) for the canvas.
*   **Don't** use "Card-in-Card" layouts with multiple borders. Use white space and tonal shifts instead.
*   **Don't** use standard blue for links. Every interaction must use the `primary`, `secondary`, or `tertiary` accents.
*   **Don't** ever use a divider line to separate songs in a list. Use 16px of vertical padding to create the separation.