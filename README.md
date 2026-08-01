# Claude & Codex Limits

Monitor **Claude Code** and **Codex** usage limits directly in the VS Code status bar. Each service has its own independent indicator with progress bars, usage percentages, and reset countdowns.

## Features

- **Separate Claude and Codex indicators** — both services keep their complete status text and can be positioned independently by VS Code
- **Claude limits** — 5-hour session, 7-day all-models limit, and the optional 7-day Sonnet limit
- **Codex limits** — displays the real usage windows returned by the local Codex app-server
- **Visual progress bars** — compact six-segment bars with percentage usage
- **Reset countdowns** — shows the approximate time until each available window resets
- **Warning indicators** — 🟡 at 60–79% usage and 🔴 at 80%+
- **Shared refresh** — click either indicator to refresh Claude and Codex together
- **Automatic refresh** — both services update every 60 seconds
- **Per-service visibility** — show each indicator automatically, always, or never
- **Russian and English labels** — switch languages without restarting VS Code
- **Claude account tooltip** — hover over Claude to see the active account name and email

## Status Bar

Example with Russian labels:

```text
Claude: Сессия: ████░░ 62% (~2ч) | Неделя: ███░░░ 51% (~2д15ч)
Codex: Неделя: █░░░░░ 14% (~6д16ч)
```

Claude and Codex are separate status bar items. Other extensions may appear between them. Clicking either item runs the same refresh command and updates both services.

The displayed percentage is the portion of the limit already used. A value of `100%` means the limit is exhausted.

## How It Works

### Claude Code

Every 5 minutes, the extension reads the Claude OAuth token from `~/.claude/.credentials.json`, requests current usage from the Anthropic API via `curl`, and stores the latest result in `~/.claude/limits.json`.

On first activation, the extension also configures a Claude Code Stop hook. The hook refreshes `limits.json` after a Claude session, and the extension watches that file for immediate updates.

If the stored data stops being updated, the indicator keeps the last known numbers but marks them with a warning icon, and the tooltip shows the reason. Percentages are never silently presented as current when they are not.

### Codex

The extension requests live rate-limit data from the local Codex app-server. If live data is temporarily unavailable, it can read the most recent rate-limit event from local Codex session logs.

The signed-in Codex account shown in the tooltip comes from the app-server when it provides one, and otherwise from the local `~/.codex/auth.json`.

Only windows actually returned by Codex are displayed. For example, an account that exposes only a weekly limit shows only `Week` / `Неделя`.

## Installation

Install from the Visual Studio Marketplace or install a local `.vsix`:

1. Open Extensions in VS Code.
2. Select `…` → **Install from VSIX…**
3. Choose the downloaded package.

## Requirements

- VS Code 1.85 or newer
- Claude Code installed and signed in to display Claude limits
- Codex installed and signed in to display Codex limits
- `curl` available in `PATH` (bundled with Windows 10+, macOS, and most Linux distributions)
- Node.js available in `PATH` for the Claude Stop hook

The extension can display either service independently. You do not need to use both.

## Settings

Open VS Code Settings (`Ctrl+,`) and search for **Claude Limits**.

| Setting | Options | Default | Description |
|---|---|---|---|
| `claudeLimits.language` | `ru`, `en` | `en` | Language for labels and tooltips |
| `claudeLimits.claudeVisibility` | `auto`, `always`, `hidden` | `auto` | Controls the Claude indicator |
| `claudeLimits.codexVisibility` | `auto`, `always`, `hidden` | `auto` | Controls the Codex indicator |

Visibility modes:

- `auto` — show the indicator only when the corresponding service is connected
- `always` — always show the indicator, including `no data` states
- `hidden` — never show the indicator

## Commands

| Command | Description |
|---|---|
| `Claude & Codex Limits: Refresh` | Immediately refresh Claude and Codex usage |

The command is available from the Command Palette and runs when either status bar indicator is clicked.

## Privacy

- Claude credentials are read locally and sent only to the fixed Anthropic API endpoint used for usage data.
- Codex limits are requested from the locally installed Codex app-server.
- Credentials and access tokens are not displayed or stored by the extension.
- The Claude account name and email may appear in its tooltip.

## Known Limitations

- Background refresh runs every 60 seconds; click either indicator for an immediate update.
- Available limit windows depend on the data exposed by each service and account plan.
- Codex account name and email are not currently exposed by the local `account/read` response, so the Codex tooltip contains only the refresh hint.
- If a service changes its local credential or rate-limit interface, a future extension update may be required.

Release history is available in [CHANGELOG.md](https://github.com/maslovserg-hub/claude-limits-vscode/blob/HEAD/CHANGELOG.md).
