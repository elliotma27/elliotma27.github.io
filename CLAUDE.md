# Design direction
Cyberpunk urban density — Chongqing, Shinjuku, Kowloon.
Layered signage, extreme verticality, hairline structure.
NOT: purple gradients, glassmorphism, heavy glow, Blade Runner cosplay.

## Color
--bg:        #07090d   (cool near-black, never pure #000)
--surface:   #0e1218
--line:      #1c2430   (hairline borders — used constantly)
--text:      #e6edf3
--muted:     #6b7a8d
--accent:    #00e5ff   (electric cyan — primary, used sparingly)
--accent-2:  #ff2e88   (magenta — alerts and single highlights only)
Rule: accent covers under 5% of pixels. Restraint is the whole game.

## Type
Display: Archivo Black or Chakra Petch, tight tracking, uppercase
Mono:    IBM Plex Mono — labels, metadata, numbers
Body:    Inter
Two families max on screen at once.

## Signage principle
Tiny uppercase mono labels on everything — section indices (01 / 02 / 03),
status tags, coordinates, timestamps. Density of small text is what
creates the city feel, not glow effects.

## Layout
8px spacing scale, no arbitrary values.
Hairline 1px borders over shadows.
Panels overlap and offset slightly — avoid a clean centered column.
Asymmetric grid. Vertical rules between sections.

## Motion — maximal
This site should feel ALIVE. Ambition over restraint.
Layered depth, constant subtle movement, scroll-reactive everything.
Still forbidden: purple gradients, glassmorphism, bounce easing,
anything that hurts readability or breaks on mobile.
Everything respects prefers-reduced-motion. needs to look like one of these cyberpunk cities
