# Claude Limits Monitor

Displays your **Claude Code rate limit usage** directly in the VS Code status bar — session and weekly limits, progress bars, time-to-reset countdown, and color alerts. No extra API overhead during normal use.

---

## Features

- **Dual status bar items** — session (5-hour) and weekly (7-day) limits shown side by side
- **Visual progress bar** — 6-segment `██████░░` bar for an instant read on usage
- **Color alerts** — green → yellow at 50% → red at 80%
- **Reset countdown** — shows time remaining (`~2h`, `~3d12h`) until the limit window resets
- **Auto-clear on reset** — if the reset time has already passed, usage drops to 0% automatically without waiting for the next Claude response
- **Periodic refresh** — status updates every 60 seconds even when Claude is idle
- **Click to refresh** — click either status bar item to force an immediate update
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
Сессия: ████░░ 42% (~2h)   |   Неделя: ██░░░░ 18%
```

| Element | Meaning |
|---|---|
| `Сессия` | 5-hour rolling session window |
| `Неделя` | 7-day weekly window |
| `████░░` | Filled segments out of 6 total |
| `42%` | Current utilization percentage |
| `(~2h)` | Time remaining until reset |

Status bar color changes with usage level:

| Usage | Color |
|---|---|
| < 50% | Default (white) |
| 50–79% | Orange tint |
| ≥ 80% | Red |

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

Access via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or by clicking either status bar item.

---

## Known Limitations

- Limits update only after a Claude Code session ends (Stop hook trigger), not in real time
- Requires Claude Code CLI — does not work with the Claude web interface alone
- OAuth token is read from `~/.claude/.credentials.json`; if Claude Code changes its credential storage, the hook may need updating

---

## Release Notes

### 0.1.8
- **Fixed click-to-refresh** — extension now makes the HTTP request directly (no bash), spinner is visible during actual API wait

### 0.1.7
- **Click to refresh** — clicking the status bar item triggers a live API fetch and shows a spinner while loading

### 0.1.6
- Version bump to republish with updated release notes

### 0.1.5
- **Auto-setup on install** — extension now automatically creates the hook script and registers it in `~/.claude/settings.json`; no manual configuration needed
- **No `jq` dependency** — hook script rewritten to use only Node.js (works on all systems)

### 0.1.4
- Switched to `icon.png`
- Version bump

### 0.1.3
- Auto-reset: usage drops to 0% when `resets_at` timestamp is in the past
- Added 60-second periodic refresh timer (status updates even when file is unchanged)

### 0.1.2
- Split status bar into two separate items (session / weekly)
- Added reset countdown display

### 0.1.1
- Added color alerts (green / yellow / red)
- Progress bar visualization

### 0.1.0
- Initial release
