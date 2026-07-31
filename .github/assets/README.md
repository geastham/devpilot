# README assets

| File | Used by | Notes |
|---|---|---|
| `hero.svg` | Top of root `README.md` | 1280×340 banner. Hand-authored SVG, no external fonts or assets. Subtle SMIL animation degrades to a correct static frame if stripped. |
| `work-horizon.svg` | README — *The Work Horizon* | 1280×440 diagram of the four zones and right-to-left flow. |
| `palette.svg` | README — *Design system* | Token swatches. Keep in sync with `tailwind.config.ts` and `design/07-DESIGN-SYSTEM-TOKENS.md`. |
| `screenshot-work-horizon.png` | README — *The product* | Real capture, 1840×800 @2x, dark scheme, seeded demo dataset. |
| `screenshot-mission-control.png` | README — *The product* | Real capture, 1840×900 @2x, same dataset. |
| `social-preview.svg` / `.png` | **Not referenced in the README** | 1280×640 card for GitHub → *Settings → General → Social preview*. Upload the `.png`; regenerate it from the `.svg` if the messaging changes. |

## Regenerating the screenshots

```bash
export DEVPILOT_SQLITE_PATH="$PWD/.devpilot/data.db"
pnpm --filter @devpilot.sh/core run db:push
pnpm --filter @devpilot.sh/core run db:seed
pnpm dev:app
```

Then capture `/` and `/mission-control` at a 1840px-wide viewport with a 2× device scale
factor and `colorScheme: 'dark'`. The seed is deterministic apart from timestamps, so shots
stay comparable between runs.

## Editing the SVGs

All three are plain hand-written SVG — no build step. They reference only generic font
families (`Inter`/system sans, `JetBrains Mono`/monospace), so they render identically on
GitHub, where custom fonts are unavailable. Keep it that way: no `<style>` blocks, no
external `<image>` references, no scripts.
