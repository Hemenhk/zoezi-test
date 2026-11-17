# Anviil design notes

## Fonts

- Headings: Figtree (Google font). Used for the page heading, card titles, dialog and drawer titles, and the header wordmark.
- Body text: Geist Mono (Google font). Used for everything else: paragraphs, labels, inputs, buttons, badges, prices, times and distances.
- Both fonts are Google fonts, so use their `@fontsource-variable` packages (check the exact package names on npm before installing) and wire them to the `--font-*` tokens in `src/client/style.css`. Don't load them from a CDN.
- Keep the fallbacks: a system sans-serif stack after Figtree, a system monospace stack after Geist Mono.

## Rules of the design

- Tokens only for colour, from `globals.css`. No raw colour values.
- No gradients, glows or decorative shadows.
- (Add any other rule that the tokens and screenshots don't show.)

## Do not copy

- The Anviil name and logo.
- (Add anything else.)
