import * as vscode from 'vscode';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { parseLimits, formatFiveHourText, formatSevenDayText } from './limits';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const LIMITS_FILE = path.join(CLAUDE_DIR, 'limits.json');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const HOOK_SCRIPT = path.join(HOOKS_DIR, 'save-limits.sh');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const COLOR_EXCEEDED = '#D4875A';

const HOOK_CONTENT = `#!/usr/bin/env bash
# Claude Limits Monitor: fetches rate limits after each response
node -e "
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
let token;
try {
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  token = creds.claudeAiOauth?.accessToken;
  if (!token) process.exit(0);
} catch(e) { process.exit(0); }

https.get({
  hostname: 'api.anthropic.com',
  path: '/api/oauth/usage',
  headers: {
    'Authorization': 'Bearer ' + token,
    'anthropic-beta': 'oauth-2025-04-20'
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const d = JSON.parse(data);
      const out = {
        five_hour: { used_percentage: d.five_hour?.utilization || 0, resets_at: d.five_hour?.resets_at || null },
        seven_day: { used_percentage: d.seven_day?.utilization || 0, resets_at: d.seven_day?.resets_at || null }
      };
      fs.writeFileSync(path.join(os.homedir(), '.claude', 'limits.json'), JSON.stringify(out));
    } catch(e) {}
  });
}).on('error', () => {});
"
`;

function ensureHookSetup(): boolean {
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(HOOK_SCRIPT, HOOK_CONTENT, { mode: 0o755 });

    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}

    const hookCmd = `bash "${HOOK_SCRIPT.replace(/\\/g, '/')}"`;

    const stopGroups: unknown[] = (settings.hooks as Record<string, unknown>)?.Stop as unknown[] ?? [];
    const alreadySet = stopGroups.some((g: unknown) =>
      (g as { hooks?: { command?: string }[] })?.hooks?.some(h => h?.command?.includes('save-limits.sh'))
    );
    if (alreadySet) return false;

    if (!settings.hooks) { settings.hooks = {}; }
    const hooks = settings.hooks as Record<string, unknown[]>;
    if (!hooks.Stop) { hooks.Stop = []; }
    hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: hookCmd }] });

    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  ensureHookSetup();

  const itemFiveHour = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  itemFiveHour.command = 'claudeLimits.refresh';
  itemFiveHour.tooltip = 'Claude: 5-hour session limit';

  const itemSevenDay = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  itemSevenDay.command = 'claudeLimits.refresh';
  itemSevenDay.tooltip = 'Claude: 7-day weekly limit';

  context.subscriptions.push(itemFiveHour, itemSevenDay);

  function refresh() {
    try {
      const content = fs.readFileSync(LIMITS_FILE, 'utf8');
      const limits = parseLimits(content);
      if (limits) {
        itemFiveHour.text = formatFiveHourText(limits);
        itemFiveHour.color = limits.fiveHour >= 80 ? COLOR_EXCEEDED : undefined;
        itemSevenDay.text = formatSevenDayText(limits);
        itemSevenDay.color = limits.sevenDay >= 80 ? COLOR_EXCEEDED : undefined;
      } else {
        itemFiveHour.text = 'Claude Сессия: N/A';
        itemSevenDay.text = 'Claude Неделя: N/A';
        itemFiveHour.color = undefined;
        itemSevenDay.color = undefined;
      }
    } catch {
      itemFiveHour.text = 'Claude: no data';
      itemSevenDay.text = '';
      itemFiveHour.color = undefined;
      itemSevenDay.color = undefined;
    }
    itemFiveHour.backgroundColor = undefined;
    itemSevenDay.backgroundColor = undefined;
    itemFiveHour.show();
    itemSevenDay.show();
  }

  function fetchAndRefresh() {
    itemFiveHour.text = '$(sync~spin) Обновление...';
    itemSevenDay.text = '';
    itemFiveHour.show();
    itemSevenDay.show();

    const credsPath = path.join(CLAUDE_DIR, '.credentials.json');
    let token: string;
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      token = creds.claudeAiOauth?.accessToken;
      if (!token) { refresh(); return; }
    } catch { refresh(); return; }

    const req = https.get({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      headers: {
        'Authorization': 'Bearer ' + token,
        'anthropic-beta': 'oauth-2025-04-20'
      }
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const out = {
            five_hour: { used_percentage: d.five_hour?.utilization || 0, resets_at: d.five_hour?.resets_at || null },
            seven_day: { used_percentage: d.seven_day?.utilization || 0, resets_at: d.seven_day?.resets_at || null }
          };
          fs.writeFileSync(LIMITS_FILE, JSON.stringify(out));
        } catch {}
        refresh();
      });
    });
    req.on('error', () => refresh());
  }

  context.subscriptions.push(vscode.commands.registerCommand('claudeLimits.refresh', fetchAndRefresh));

  fs.watchFile(LIMITS_FILE, { interval: 1000 }, refresh);
  context.subscriptions.push({ dispose: () => fs.unwatchFile(LIMITS_FILE) });

  const timer = setInterval(refresh, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  refresh();
}

export function deactivate() {}
