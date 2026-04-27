# Claude Limits Monitor

Displays your **Claude Code rate limit usage** directly in the VS Code status bar — 5-hour session, weekly all-models limit, and (on Max plan) weekly Sonnet limit. Single status bar item with visual progress bars and warning indicators.

---

## Features

- **Single grouped status bar item** — all three indicators stay together; other extensions can't split them
- **Three limits in one place** — 5-hour session, 7-day weekly (all models), 7-day weekly Sonnet only (Max plan)
- **Visual progress bar** — 6-segment `██████░░` bar for an instant read on usage
- **Warning circles** — 🟡 appears at 60–79% usage, 🔴 at 80%+; below 60% there's no clutter
- **Reset countdown** — shows time remaining (`~2h`, `~3d12h`) until the limit window resets
- **Auto-hide Sonnet block** — third indicator only appears when the API returns Sonnet limit data (Max plan)
- **Periodic refresh** — status updates every 60 seconds even when Claude is idle
- **Click to refresh** — click the status bar item to force an immediate API fetch
- **Cross-platform** — works on Windows, macOS, and Linux

---

## How It Works

The extension reads limit data from `~/.claude/limits.json`. This file is written by a **Stop hook** in Claude Code — a small Node.js script that calls the Anthropic OAuth usage API (`/api/oauth/usage`) after each Claude session ends and saves the result locally.

```
Claude Code session ends
        ↓
Stop hook runs save-limits.sh
        ↓
~/.claude/limits.json updated
        ↓
Extension reads file → Status Bar updated
```

No API calls are made by the extension itself. All data comes from the hook.

---

## Status Bar Format

```
Сессия: ████░░ 42% (~2ч) | Неделя: ██░░░░ 🟡65% | Sonnet: █████░ 🔴85%
```

| Element | Meaning |
|---|---|
| `Сессия` | 5-hour rolling session window |
| `Неделя` | 7-day weekly window (all models) |
| `Sonnet` | 7-day weekly Sonnet-only limit (Max plan only — appears when API returns it) |
| `████░░` | Filled segments out of 6 total |
| `42%` | Current utilization percentage |
| `(~2ч)` | Time remaining until reset |

Warning circles appear next to the percentage:

| Usage | Indicator |
|---|---|
| < 60% | (none — bar + percentage only) |
| 60–79% | 🟡 yellow circle |
| ≥ 80% | 🔴 red circle |

---

## Setup

### Install the extension

Install from `.vsix` via `Extensions → ··· → Install from VSIX`.

**That's it.** On first activation the extension automatically:

1. Creates `~/.claude/hooks/save-limits.sh`
2. Registers the Stop hook in `~/.claude/settings.json`

A one-time notification confirms the hook was configured. After your next Claude Code session ends, the status bar will populate with live data.

> **No `jq` required.** The hook script uses only Node.js, which is already bundled with Claude Code.

#### Manual setup (optional)

If you prefer to configure the hook yourself, or the automatic setup didn't run, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.claude/hooks/save-limits.sh"
      }]
    }]
  }
}
```

On **Windows**, use the full path:

```json
"command": "bash \"C:/Users/YourName/.claude/hooks/save-limits.sh\""
```

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI installed and signed in (provides OAuth credentials)
- Node.js available in PATH (for the hook script)
- VS Code 1.85+

---

## Commands

| Command | Description |
|---|---|
| `Claude Limits: Refresh` | Force-read `limits.json` and update status bar immediately |

Access via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or by clicking the status bar item.

---

## Known Limitations

- Background refresh runs every 60 seconds; for instant update click the status bar item
- Requires Claude Code CLI — does not work with the Claude web interface alone
- OAuth token is read from `~/.claude/.credentials.json`; if Claude Code changes its credential storage, the hook may need updating
- Sonnet weekly indicator appears only on plans where the API exposes it (Max); on Pro it's hidden

---

Release history is in [CHANGELOG.md](CHANGELOG.md).
