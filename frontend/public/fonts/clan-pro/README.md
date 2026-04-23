# Clan Pro (commercial)

This directory holds the self-hosted Clan Pro webfont files used by the
BChemXtract wordmark (`<BrandName />`). The font is **not** bundled in the
repository — it's a commercial face from FontFont / Monotype with
per-workspace licensing.

## Expected filenames

Drop `.woff2` files here with these exact names. `@font-face` rules in
`frontend/src/styles/clan-pro.css` reference these paths verbatim:

| file                           | css `font-weight` | css `font-style` |
| ------------------------------ | ----------------- | ---------------- |
| `clan-pro-regular.woff2`       | `400`             | `normal`         |
| `clan-pro-medium.woff2`        | `500`             | `normal`         |
| `clan-pro-bold.woff2`          | `700`             | `normal`         |

Only `medium` is load-bearing for the current design (the `X` in the
wordmark uses it). `regular` and `bold` are declared for future use so
adding a second weight later doesn't require another scaffold change.

## Activation

Once the files are present:

1. Open `frontend/src/styles/fonts.css`.
2. Add one line: `@import "./clan-pro.css";` **after** the JetBrains Mono import.
3. Commit with scope `feat(fonts)` and a reference to the license source.

Without the files, `@font-face` loading silently fails and the CSS stack
falls back to `var(--font-display)` (JetBrains Mono). This is intentional.

## License handling

The font files themselves are **never** committed to this repository
(`.gitignore` excludes `.woff2` under this path — see the repo-root
`.gitignore`). The workspace license key lives with the purchaser.
