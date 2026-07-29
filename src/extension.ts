import * as vscode from 'vscode';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { parseLimits, formatStatusText, parseCodexLimitsFromSessionLog, parseCodexLimitsFromWhamUsage, parseCodexLimitsFromAppServerRateLimits, formatCodexStatusText, shouldShowService, CodexLimitsData, VisibilityMode, Lang } from './limits';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const LIMITS_FILE = path.join(CLAUDE_DIR, 'limits.json');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const HOOK_SCRIPT = path.join(HOOKS_DIR, 'save-limits.sh');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CREDS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

function findLatestCodexSessionFiles(dir: string, limit = 20): string[] {
  const files: { file: string; mtimeMs: number }[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          files.push({ file: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs });
        } catch {}
      }
    }
  }

  walk(dir);
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(item => item.file);
}

function readLatestCodexLimits() {
  for (const file of findLatestCodexSessionFiles(CODEX_SESSIONS_DIR)) {
    try {
      const limits = parseCodexLimitsFromSessionLog(fs.readFileSync(file, 'utf8'));
      if (limits) return limits;
    } catch {}
  }
  return null;
}

function fetchCodexLimits(onAccountLabel: (label: string) => void): Promise<CodexLimitsData | null> {
  return fetchCodexLimitsFromAppServer(onAccountLabel);
}

function findCodexExecutable(): string | null {
  const desktopBin = path.join(os.homedir(), 'AppData', 'Local', 'OpenAI', 'Codex', 'bin');
  try {
    const versions = fs.readdirSync(desktopBin, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(desktopBin, entry.name, 'codex.exe'))
      .filter(file => fs.existsSync(file));
    if (versions.length > 0) return versions[versions.length - 1];
  } catch {}
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function fetchCodexLimitsFromAppServer(onAccountLabel: (label: string) => void): Promise<CodexLimitsData | null> {
  return new Promise(resolve => {
    const executable = findCodexExecutable();
    if (!executable) {
      resolve(null);
      return;
    }

    let settled = false;
    let buffer = '';
    const child = spawn(executable, ['app-server'], {
      env: { ...process.env, CODEX_HOME: path.join(os.homedir(), '.codex') },
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });

    function finish(limits: CodexLimitsData | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve(limits);
    }

    function send(message: unknown): void {
      try {
        child.stdin.write(JSON.stringify(message) + '\n');
      } catch {
        finish(null);
      }
    }

    const timer = setTimeout(() => finish(null), 10_000);

    child.on('error', () => finish(null));
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1) {
            send({ method: 'initialized', params: {} });
            send({ method: 'account/read', id: 2, params: { refreshToken: true } });
          } else if (message.id === 2) {
            const account = message.result?.account ?? message.result;
            const email = typeof account?.email === 'string' ? account.email : '';
            const name = typeof account?.displayName === 'string'
              ? account.displayName
              : typeof account?.name === 'string'
                ? account.name
                : '';
            onAccountLabel(name && email ? `${name} (${email})` : email || name);
            send({ method: 'account/rateLimits/read', id: 3 });
          } else if (message.id === 3) {
            finish(parseCodexLimitsFromAppServerRateLimits(message.result?.rateLimits));
          }
        } catch {}
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'claude-limits-vscode', title: 'Claude Limits VS Code', version: '0.3.2' },
      },
    });
  });
}

function fetchAccountLabel(): Promise<string> {
  return new Promise(resolve => {
    try {
      const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
      const token = creds?.claudeAiOauth?.accessToken;
      if (!token) { resolve(''); return; }
      https.get({
        hostname: 'api.anthropic.com',
        path: '/api/oauth/profile',
        headers: { 'Authorization': 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20' }
      }, res => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => {
          try {
            const d = JSON.parse(data);
            const acc = d?.account;
            if (!acc) { resolve(''); return; }
            const label = acc.display_name ? `${acc.display_name} (${acc.email})` : acc.email;
            resolve(label || '');
          } catch { resolve(''); }
        });
      }).on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}

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

  if (!context.globalState.get('languageHintShown')) {
    context.globalState.update('languageHintShown', true);
    vscode.window.showInformationMessage(
      'Claude Limits: status bar is in English by default. Switch to Russian in Settings → claudeLimits.language = ru',
      'Open Settings'
    ).then(choice => {
      if (choice === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:maslovserg.claude-limits');
      }
    });
  }

  const claudeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  const codexItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  claudeItem.command = 'claudeLimits.refresh';
  codexItem.command = 'claudeLimits.refresh';
  context.subscriptions.push(claudeItem, codexItem);

  const STRINGS: Record<Lang, { tooltip: string; updating: string; codexTooltip: string }> = {
    ru: {
      tooltip: 'Claude Limits — клик для обновления',
      updating: '$(sync~spin) Claude Limits: обновление...',
      codexTooltip: 'Codex Limit: клик для обновления',
    },
    en: {
      tooltip: 'Claude Limits — click to refresh',
      updating: '$(sync~spin) Claude Limits: updating...',
      codexTooltip: 'Codex Limit: click to refresh',
    },
  };

  let cachedAccountLabel = '';
  let cachedCodexAccountLabel = '';
  let cachedCodexLimits: CodexLimitsData | null = null;
  let codexConnected = false;

  function applyTooltips(lang: Lang): void {
    claudeItem.tooltip = cachedAccountLabel
      ? `${STRINGS[lang].tooltip}\n${cachedAccountLabel}`
      : STRINGS[lang].tooltip;
    codexItem.tooltip = cachedCodexAccountLabel
      ? `${STRINGS[lang].codexTooltip}\n${cachedCodexAccountLabel}`
      : STRINGS[lang].codexTooltip;
  }

  function getLang(): Lang {
    return vscode.workspace.getConfiguration('claudeLimits').get<Lang>('language', 'en');
  }

  function getVisibility(key: 'claudeVisibility' | 'codexVisibility'): VisibilityMode {
    return vscode.workspace.getConfiguration('claudeLimits').get<VisibilityMode>(key, 'auto');
  }

  function isClaudeConnected(): boolean {
    try {
      const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
      return typeof creds?.claudeAiOauth?.accessToken === 'string' && creds.claudeAiOauth.accessToken.length > 0;
    } catch {
      return false;
    }
  }

  function refresh() {
    const lang = getLang();
    applyTooltips(lang);
    let claudeText: string;
    try {
      const content = fs.readFileSync(LIMITS_FILE, 'utf8');
      const limits = parseLimits(content);
      if (limits) {
        claudeText = formatStatusText(limits, lang);
      } else {
        claudeText = 'Claude: N/A';
      }
    } catch {
      claudeText = 'Claude: no data';
    }

    const codexLimits = cachedCodexLimits ?? readLatestCodexLimits();
    const codexText = codexLimits ? formatCodexStatusText(codexLimits, lang) : 'Codex: no data';
    claudeItem.text = claudeText;
    codexItem.text = codexText;
    if (shouldShowService(getVisibility('claudeVisibility'), isClaudeConnected())) {
      claudeItem.show();
    } else {
      claudeItem.hide();
    }
    if (shouldShowService(getVisibility('codexVisibility'), codexConnected)) {
      codexItem.show();
    } else {
      codexItem.hide();
    }
  }

  function fetchAndRefresh(showSpinner = false) {
    if (showSpinner) {
      claudeItem.text = STRINGS[getLang()].updating;
      codexItem.text = '$(sync~spin) Codex: updating...';
      if (shouldShowService(getVisibility('claudeVisibility'), isClaudeConnected())) claudeItem.show();
      if (shouldShowService(getVisibility('codexVisibility'), codexConnected)) codexItem.show();
    }

    fetchAccountLabel().then(label => {
      cachedAccountLabel = label;
      applyTooltips(getLang());
    });

    fetchCodexLimits(label => {
      cachedCodexAccountLabel = label;
      applyTooltips(getLang());
    }).then(limits => {
      cachedCodexLimits = limits;
      codexConnected = Boolean(limits);
      refresh();
    });

    let token: string;
    try {
      const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
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

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (
      e.affectsConfiguration('claudeLimits.language') ||
      e.affectsConfiguration('claudeLimits.claudeVisibility') ||
      e.affectsConfiguration('claudeLimits.codexVisibility')
    ) {
      refresh();
    }
  }));

  fetchAndRefresh();
}

export function deactivate() {}
