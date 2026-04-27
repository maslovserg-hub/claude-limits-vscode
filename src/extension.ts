import * as vscode from 'vscode';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { parseLimits, formatStatusText } from './limits';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const LIMITS_FILE = path.join(CLAUDE_DIR, 'limits.json');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const HOOK_SCRIPT = path.join(HOOKS_DIR, 'save-limits.sh');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

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
      if (d.error || res.statusCode !== 200) return;
      if (typeof d.five_hour?.utilization !== 'number' || typeof d.seven_day?.utilization !== 'number') return;
      const out = {
        five_hour: { used_percentage: d.five_hour.utilization, resets_at: d.five_hour.resets_at || null },
        seven_day: { used_percentage: d.seven_day.utilization, resets_at: d.seven_day.resets_at || null }
      };
      if (typeof d.seven_day_sonnet?.utilization === 'number') {
        out.seven_day_sonnet = { used_percentage: d.seven_day_sonnet.utilization, resets_at: d.seven_day_sonnet.resets_at || null };
      }
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

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'claudeLimits.refresh';
  item.tooltip = 'Claude Limits — клик для обновления';

  context.subscriptions.push(item);

  function refresh() {
    try {
      const content = fs.readFileSync(LIMITS_FILE, 'utf8');
      const limits = parseLimits(content);
      if (limits) {
        item.text = formatStatusText(limits);
      } else {
        item.text = 'Claude Limits: N/A';
      }
    } catch {
      item.text = 'Claude Limits: no data';
    }
    item.show();
  }

  function fetchAndRefresh(showSpinner = false) {
    if (showSpinner) {
      item.text = '$(sync~spin) Claude Limits: обновление...';
      item.show();
    }

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
          if (!d.error && res.statusCode === 200 &&
              typeof d.five_hour?.utilization === 'number' && typeof d.seven_day?.utilization === 'number') {
            const out: Record<string, unknown> = {
              five_hour: { used_percentage: d.five_hour.utilization, resets_at: d.five_hour.resets_at || null },
              seven_day: { used_percentage: d.seven_day.utilization, resets_at: d.seven_day.resets_at || null }
            };
            if (typeof d.seven_day_sonnet?.utilization === 'number') {
              out.seven_day_sonnet = { used_percentage: d.seven_day_sonnet.utilization, resets_at: d.seven_day_sonnet.resets_at || null };
            }
            fs.writeFileSync(LIMITS_FILE, JSON.stringify(out));
          }
        } catch {}
        refresh();
      });
    });
    req.on('error', () => refresh());
  }

  context.subscriptions.push(vscode.commands.registerCommand('claudeLimits.refresh', () => fetchAndRefresh(true)));

  fs.watchFile(LIMITS_FILE, { interval: 1000 }, refresh);
  context.subscriptions.push({ dispose: () => fs.unwatchFile(LIMITS_FILE) });

  const timer = setInterval(fetchAndRefresh, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  refresh();
}

export function deactivate() {}
