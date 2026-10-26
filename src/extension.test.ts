import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const state = vi.hoisted(() => ({
  bars: true,
  fail: false,
  limitsDelay: 0,
  requests: [] as any[],
  items: [] as any[],
  changed: undefined as any,
  spawned: [] as string[],
}));
vi.mock('vscode', () => ({
  extensions: { getExtension: () => ({ extensionPath: '/codex-extension' }) },
  StatusBarAlignment: { Right: 1 },
  window: { createStatusBarItem: () => {
    const item = { text: '', tooltip: '', visible: false, show() { this.visible = true; }, hide() { this.visible = false; } };
    state.items.push(item); return item;
  } },
  workspace: {
    getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'showProgressBars' ? state.bars : fallback }),
    onDidChangeConfiguration: (callback: any) => { state.changed = callback; return { dispose() {} }; },
  },
  commands: { registerCommand: () => ({ dispose() {} }) },
}));
vi.mock('fs', () => ({
  existsSync: () => true, mkdirSync() {}, writeFileSync() {}, watchFile() {}, unwatchFile() {},
  readdirSync: () => [], statSync: () => ({ mtimeMs: Date.now() }),
  readFileSync: (file: string) => {
    if (file.endsWith('limits.json')) return JSON.stringify({ five_hour: { used_percentage: 10 }, seven_day: { used_percentage: 30 } });
    return '{}';
  },
}));
vi.mock('child_process', () => ({ spawn: (executable: string) => {
  state.spawned.push(executable);
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {};
  child.stdin.write = (line: string) => {
    const request = JSON.parse(line);
    if (!request.id) return;
    state.requests.push(request);
    const respond = () => {
      if (state.fail) { child.emit('error', { code: 'ENOENT' }); return; }
      const result = request.id === 3 ? { rateLimits: { primary: { usedPercent: 18, windowDurationMins: 300 } } } : {};
      child.stdout.emit('data', Buffer.from(JSON.stringify({ id: request.id, result }) + '\n'));
    };
    if (request.id === 3 && state.limitsDelay) setTimeout(respond, state.limitsDelay);
    else queueMicrotask(respond);
  };
  return child;
} }));
import { activate } from './extension';

describe('extension integration', () => {
  beforeEach(() => { vi.useFakeTimers(); state.bars = true; state.fail = false; state.limitsDelay = 0; state.requests = []; state.items = []; state.spawned = []; });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  async function start() {
    activate({ globalState: { get: () => true }, subscriptions: [] } as any);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }
  it('accepts slow limit responses without forcing token refresh or starting duplicate requests', async () => {
    state.limitsDelay = 25000;
    await start();
    await vi.advanceTimersByTimeAsync(25000);
    expect(state.items[1].text).toContain('18%');
    expect(state.requests.filter(request => request.method === 'initialize')).toHaveLength(1);
    expect(state.requests.find(request => request.method === 'account/read').params.refreshToken).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.items[1].tooltip).not.toContain('Request timed out');
  });
  it('still times out an unresponsive Codex server', async () => {
    state.limitsDelay = 65000;
    await start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.items[1].tooltip).toContain('Request timed out');
    expect(state.requests.filter(request => request.method === 'initialize')).toHaveLength(1);
  });
  it('uses bundled Codex and toggles bars immediately for both services', async () => {
    await start();
    expect(state.spawned[0]).toContain('codex-extension');
    expect(state.items[1].text).toContain('18%');
    expect(state.items[0].text).toMatch(/^\$\(claude-limits-claude\) /);
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
    expect(state.items[0].text).toMatch(/[█░]/);
    expect(state.items[1].text).toMatch(/[█░]/);
    state.bars = false;
    state.changed({ affectsConfiguration: (key: string) => key === 'claudeLimits.showProgressBars' });
    for (const item of state.items) expect(item.text).not.toMatch(/[█░]/);
    expect(state.items[0].text).toContain('10%');
    expect(state.items[1].text).toContain('18%');
    expect(state.items[0].text).toMatch(/^\$\(claude-limits-claude\) /);
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
    state.bars = true;
    state.changed({ affectsConfiguration: (key: string) => key === 'claudeLimits.showProgressBars' });
    for (const item of state.items) expect(item.text).toMatch(/[█░]/);
  });
  it('retries a transient startup failure without showing a warning', async () => {
    state.fail = true; await start();
    state.fail = false;
    await vi.advanceTimersByTimeAsync(10000);
    expect(state.items[1].text).toContain('18%');
    await vi.advanceTimersByTimeAsync(20000);
    expect(state.items[1].text).not.toContain('$(warning)');
    expect(state.items[1].tooltip).not.toContain('ENOENT');
  });
  it('delays startup warnings for 30 seconds, then explains persistent failure', async () => {
    state.fail = true; await start();
    expect(state.items[1].text).not.toContain('$(warning)');
    expect(state.items[1].tooltip).not.toContain('ENOENT');
    await vi.advanceTimersByTimeAsync(29999);
    expect(state.items[1].text).not.toContain('$(warning)');
    await vi.advanceTimersByTimeAsync(1);
    expect(state.items[1].visible).toBe(true);
    expect(state.items[1].text).toContain('Could not fetch limits');
    expect(state.items[1].tooltip).toContain('ENOENT');
    expect(state.items[1].text).toMatch(/^\$\(claude-limits-codex\) /);
  });
});
