# Motion Design

## Duration: The 100/300/500 Rule

Timing matters more than easing. These durations feel right for most UI:

| Duration | Use Case | Examples |
|----------|----------|----------|
| **100-150ms** | Instant feedback | Button press, toggle, color change |
| **200-300ms** | State changes | Menu open, tooltip, hover states |
| **300-500ms** | Layout changes | Accordion, modal, drawer |
| **500-800ms** | Entrance animations | Page load, hero reveals |

Exit animations are faster than entrances—use ~75% of enter duration.

## Easing: Pick the Right Curve

Don't use `ease`. It's a compromise that's rarely optimal. Instead:

| Curve | Use For | CSS |
|-------|---------|-----|
| **ease-out** | Elements entering | `cubic-bezier(0.16, 1, 0.3, 1)` |
| **ease-in** | Elements leaving | `cubic-bezier(0.7, 0, 0.84, 0)` |
| **ease-in-out** | State toggles (there → back) | `cubic-bezier(0.65, 0, 0.35, 1)` |

For micro-interactions, apply exponential curves to mimic natural physics:

```css
/* Quart out - smooth, refined (recommended default) */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

/* Quint out - slightly more dramatic */
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);

/* Expo out - snappy, confident */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

Avoid bounce and elastic curves. They were trendy in 2015 but now feel tacky and amateurish.

## The Only Two Properties You Should Animate

**transform** and **opacity** only—everything else causes layout recalculation. For height animations, use `grid-template-rows: 0fr → 1fr` instead of animating `height` directly.

## Staggered Animations

Use CSS custom properties: `animation-delay: calc(var(--i, 0) * 50ms)` with `style="--i: 0"` on each item. Cap total stagger time—10 items at 50ms = 500ms total.

## Reduced Motion

This is not optional. Vestibular disorders affect ~35% of adults over 40.

```css
.card {
  animation: slide-up 500ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .card {
    animation: fade-in 200ms ease-out;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Preserve functional animations like progress bars and focus indicators—just without spatial movement.

## Perceived Performance

Nobody cares how fast your site is—just how fast it feels. The 80ms threshold represents when our brains synchronize sensory input; anything below feels instant.

**Active vs passive time**: Passive waiting feels longer than active engagement. Shift the balance through:

- **Preemptive start**: Begin transitions while loading (skeleton UI)
- **Early completion**: Show content progressively
- **Optimistic UI**: Update interfaces immediately, sync later

Easing affects perceived duration: ease-in makes tasks feel shorter because the peak-end effect weights final moments heavily.

## Performance

Don't use `will-change` preemptively—only when animation is imminent. For scroll-triggered animations, use Intersection Observer instead of scroll events. Create motion tokens for consistency.

**Avoid**: Animating everything (animation fatigue is real). Using >500ms for UI feedback. Ignoring `prefers-reduced-motion`.
