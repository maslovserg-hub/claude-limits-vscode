# Claude Limits Monitor

Displays your **Claude Code rate limit usage** directly in the VS Code status bar — 5-hour session, weekly all-models limit, and (on Max plan) weekly Sonnet limit. Single status bar item with visual progress bars and warning indicators.

---

## Features

- **Single grouped status bar item** — all three indicators stay together; other extensions can't split them
- **Three limits in one place** — 5-hour session, 7-day weekly (all models), 7-day weekly Sonnet only (Max plan)
- **Visual progress bar** — 6-segment `██████░░` bar for session and weekly; Sonnet shown as compact `S: 🔴85%`
- **Warning circles** — 🟡 appears at 60–79% usage, 🔴 at 80%+; below 60% there's no clutter
- **Reset countdown** — shows time remaining (`~2h`, `~3d12h`) until the limit window resets
- **Auto-hide Sonnet block** — compact `S:` indicator only appears when the API returns Sonnet limit data (Max plan)
- **Language setting** — English by default (`Session` / `Week`); switch to `ru` (Сессия / Неделя) in VS Code settings; applies instantly without restart
- **Account tooltip** — hover over the status bar to see the active account name and email (fetched live, always up to date)
- **Periodic refresh** — status updates every 60 seconds even when Claude is idle
- **Click to refresh** — click the status bar item to force an immediate API fetch
- **Cross-platform** — works on Windows, macOS, and Linux

---

## How It Works

The extension updates the status bar in two ways:

**Automatic (every 60 s)** — the extension calls the Anthropic OAuth usage API (`/api/oauth/usage`) directly, using the token stored by Claude Code in `~/.claude/.credentials.json`, and saves the result to `~/.claude/limits.json`.

**After each Claude session** — a Stop hook runs `save-limits.sh`, which also writes to `~/.claude/limits.json`. The extension watches the file and refreshes immediately on change.

```
Every 60 seconds                    Claude Code session ends
        ↓                                      ↓
Extension → Anthropic API        Stop hook → Anthropic API
        ↓                                      ↓
~/.claude/limits.json ←————————————————————————
        ↓
Status Bar updated
```

Clicking the status bar item triggers an immediate API fetch (with a spinner while loading).

---

## Status Bar Format

Without Sonnet data (Pro plan, or Max plan before Sonnet usage accumulates):

```
Session: ████░░ 42% (~2h) | Week: ██░░░░ 🟡65% (~3d)
```

With Sonnet data (Max plan):

```
Session: ████░░ 42% (~2h) | Week: ██░░░░ 🟡65% (~3d) | S: 🔴85%
```

Hover over the status bar item to see the active account name and email.

| Element | Meaning |
|---|---|
| `Session` | 5-hour rolling session window |
| `Week` | 7-day weekly window (all models) |
| `S:` | 7-day weekly Sonnet-only limit — Max plan only, appears when usage > 0% |
| `████░░` | 6-segment progress bar — shown for Session and Week only |
| `42%` | Current utilization percentage |
| `(~2h)` | Time remaining until reset |

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

## Settings

Open VS Code Settings (`Ctrl+,`) and search for **Claude Limits**.

| Setting | Options | Default | Description |
|---|---|---|---|
| `claudeLimits.language` | `ru`, `en` | `en` | Language for status bar labels and tooltip |

With `ru`: status bar shows `Сессия` / `Неделя`, tooltip says `клик для обновления`.

> On first install, the extension shows a one-time notification with an **Open Settings** button to make switching easy.

---

## Commands

| Command | Description |
|---|---|
| `Claude Limits: Refresh` | Force-fetch limits from the API and update the status bar immediately |

Access via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or by clicking the status bar item.

---

## Known Limitations

- Background refresh runs every 60 seconds; for instant update click the status bar item
- Requires Claude Code CLI — does not work with the Claude web interface alone
- OAuth token is read from `~/.claude/.credentials.json`; if Claude Code changes its credential storage, the hook may need updating
- Sonnet weekly indicator appears only on plans where the API exposes it (Max); on Pro it's hidden

---

Release history is in [CHANGELOG.md](https://github.com/maslovserg-hub/claude-limits-vscode/blob/HEAD/CHANGELOG.md).
