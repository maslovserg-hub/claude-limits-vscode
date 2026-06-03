# Changelog

## [0.3.1]
- **Removed account switch button** — the button was calling `claude auth logout` globally, which logged out all active Claude Code sessions; removed entirely

## [0.3.0]
- **Account in tooltip** — hovering over the limits indicator shows the active account name and email, fetched live from `/api/oauth/profile`

## [0.2.9]
- **Account in tooltip** — hovering over the status bar now shows the active Claude account (name + email) below the refresh hint

## [0.2.8]
- **Language setting** — new `Claude Limits: Language` option (`ru` / `en`). English is the default: status bar shows `Session` / `Week`; switch to `ru` for Russian labels. Applies instantly without restarting VS Code
- Tooltip and refresh spinner text also respect the language setting
- One-time hint on first install: notifies the user that Russian labels are available, with an "Open Settings" button
- Fixed marketplace description: updated status bar format, added missing versions [0.2.6] and [0.1.9], corrected "How It Works" section

## [0.2.7]
- **Language setting** — new `Claude Limits: Language` option (`ru` / `en`). With `en`, the status bar shows `Session` and `Week` instead of Russian labels. Applies instantly without restarting VS Code
- Fixed marketplace description: updated status bar format, added missing versions [0.2.6] and [0.1.9], corrected "How It Works" section

## [0.2.6]
- **Compact Sonnet block** — displayed as `S: 🔴85%` with no progress bar; progress bar is shown only for Session and Week

## [0.2.5]
- Sonnet block hidden at 0% — appears only when actual usage accumulates
- Reset countdown removed from Sonnet block — it is already shown in the Week block

## [0.2.4]
- **Warning circles appear only when at risk** — below 60% the status bar is clean (bar + number only), 🟡 at 60–79%, 🔴 at 80%+; green circle removed
- README updated to match current format; Release Notes section removed (history is now in CHANGELOG only)

## [0.2.3]
- Circles replaced with 🟡 / 🔴 and moved right next to the percentage number

## [0.2.2]
- All three indicators merged into a **single status bar item** — other extensions can no longer split the group

## [0.2.1]
- Added **third indicator** — weekly Sonnet-only limit (Max plan). Appears automatically when the API returns the `seven_day_sonnet` field

## [0.2.0]
- **Fixed zero display** — removed the logic that reset usage to 0% when `resets_at` was in the past; the real API value is always shown now

## [0.1.9]
- **Background API polling** — extension calls the Anthropic API directly every 60 seconds, independent of the hook
- Spinner shown only on manual click; background refresh is silent

## [0.1.8]
- **Fixed click-refresh** — extension now makes the HTTP request directly (no bash), spinner is visible during the actual API wait

## [0.1.7]
- **Click to refresh** — clicking the status bar item triggers a live API request and shows a spinner while loading

## [0.1.6]
- Version bump to republish with updated release notes

## [0.1.5]
- **Auto-setup on install** — extension automatically creates `~/.claude/hooks/save-limits.sh` and registers the Stop hook in `~/.claude/settings.json`; no manual configuration needed
- **No `jq` dependency** — hook script rewritten to use only Node.js (works on Windows, macOS, Linux)

## [0.1.4]
- Switched to `icon.png`
- Version bump

## [0.1.3]
- Auto-reset: usage drops to 0% when `resets_at` timestamp is in the past
- Added 60-second periodic refresh timer (status updates even when file is unchanged)

## [0.1.2]
- Split status bar into two separate items (session / weekly)
- Added reset countdown display

## [0.1.1]
- Added color alerts (green / yellow / red)
- Progress bar visualization

## [0.1.0]
- Initial release
