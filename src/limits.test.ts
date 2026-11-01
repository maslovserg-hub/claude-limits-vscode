import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseLimits,
  formatProgressBar,
  getColor,
  getStatusEmoji,
  formatStatusText,
  formatSevenDaySonnetText,
  parseCodexLimitsFromJsonLine,
  parseCodexLimitsFromSessionLog,
  parseCodexLimitsFromWhamUsage,
  parseCodexLimitsFromAppServerRateLimits,
  parseCodexAccountLabel,
  formatCodexStatusText,
  parseKimiUsage,
  formatKimiStatusText,
  parseKimiAccountLabel,
  shouldShowService,
} from './limits';


describe('parseLimits', () => {
  it('parses valid JSON with both limits', () => {
    const json = {
      five_hour: { used_percentage: 42 },
      seven_day: { used_percentage: 18 }
    };
    const result = parseLimits(JSON.stringify(json));
    expect(result).toMatchObject({ fiveHour: 42, sevenDay: 18 });
  });

  it('returns null for invalid JSON', () => {
    expect(parseLimits('not json')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parseLimits('{}')).toBeNull();
  });

  it('parses seven_day_sonnet when present', () => {
    const json = {
      five_hour: { used_percentage: 10 },
      seven_day: { used_percentage: 20 },
      seven_day_sonnet: { used_percentage: 5 }
    };
    const result = parseLimits(JSON.stringify(json));
    expect(result?.sevenDaySonnet).toBe(5);
  });

  it('omits sevenDaySonnet when seven_day_sonnet missing', () => {
    const json = {
      five_hour: { used_percentage: 10 },
      seven_day: { used_percentage: 20 }
    };
    const result = parseLimits(JSON.stringify(json));
    expect(result?.sevenDaySonnet).toBeUndefined();
  });

  it('omits sevenDaySonnet when utilization is 0', () => {
    const json = {
      five_hour: { used_percentage: 10 },
      seven_day: { used_percentage: 20 },
      seven_day_sonnet: { used_percentage: 0 }
    };
    const result = parseLimits(JSON.stringify(json));
    expect(result?.sevenDaySonnet).toBeUndefined();
  });
});

describe('shouldShowService', () => {
  it('shows auto mode only for a connected service', () => {
    expect(shouldShowService('auto', true)).toBe(true);
    expect(shouldShowService('auto', false)).toBe(false);
  });

  it('supports explicit always and hidden modes', () => {
    expect(shouldShowService('always', false)).toBe(true);
    expect(shouldShowService('hidden', true)).toBe(false);
  });
});

describe('formatProgressBar', () => {
  it('shows empty bar for 0%', () => {
    expect(formatProgressBar(0)).toBe('░░░░░░');
  });

  it('shows full bar for 100%', () => {
    expect(formatProgressBar(100)).toBe('██████');
  });

  it('shows half bar for 50%', () => {
    expect(formatProgressBar(50)).toBe('███░░░');
  });

  it('rounds correctly for 42%', () => {
    expect(formatProgressBar(42)).toBe('███░░░');
  });

  it('clamps out-of-range percents instead of throwing', () => {
    expect(formatProgressBar(110)).toBe('██████');
    expect(formatProgressBar(-10)).toBe('░░░░░░');
  });
});

describe('getColor', () => {
  it('returns green for low usage', () => {
    expect(getColor(30)).toBe('green');
  });

  it('returns yellow for medium usage', () => {
    expect(getColor(60)).toBe('yellow');
  });

  it('returns red for high usage', () => {
    expect(getColor(85)).toBe('red');
  });

  it('returns yellow at exactly 50%', () => {
    expect(getColor(50)).toBe('yellow');
  });

  it('returns red at exactly 80%', () => {
    expect(getColor(80)).toBe('red');
  });
});

describe('getStatusEmoji', () => {
  it('returns empty string for low usage', () => {
    expect(getStatusEmoji(30)).toBe('');
  });

  it('returns empty just below threshold', () => {
    expect(getStatusEmoji(59)).toBe('');
  });

  it('returns yellow circle at exactly 60%', () => {
    expect(getStatusEmoji(60)).toBe('🟡');
  });

  it('returns yellow circle at 79%', () => {
    expect(getStatusEmoji(79)).toBe('🟡');
  });

  it('returns red circle at exactly 80%', () => {
    expect(getStatusEmoji(80)).toBe('🔴');
  });

  it('returns red circle for high usage', () => {
    expect(getStatusEmoji(95)).toBe('🔴');
  });
});

describe('formatStatusText', () => {
  it('shows no emoji below 60% (en)', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 });
    expect(result).toBe('Claude: Session: ███░░░ 50% | Week: ██░░░░ 25%');
  });

  it('shows no emoji below 60% (ru)', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 }, 'ru');
    expect(result).toBe('Claude: Сессия: ███░░░ 50% | Неделя: ██░░░░ 25%');
  });

  it('handles 0% values without emoji', () => {
    const result = formatStatusText({ fiveHour: 0, sevenDay: 0 }, 'ru');
    expect(result).toBe('Claude: Сессия: ░░░░░░ 0% | Неделя: ░░░░░░ 0%');
  });

  it('shows yellow circle in 60-79% range', () => {
    const result = formatStatusText({ fiveHour: 65, sevenDay: 25 }, 'ru');
    expect(result).toBe('Claude: Сессия: ████░░ 🟡65% | Неделя: ██░░░░ 25%');
  });

  it('shows red circle at 80%+', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 85 }, 'ru');
    expect(result).toBe('Claude: Сессия: ███░░░ 50% | Неделя: █████░ 🔴85%');
  });

  it('appends Sonnet block when sevenDaySonnet is present', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25, sevenDaySonnet: 85 }, 'ru');
    expect(result).toBe('Claude: Сессия: ███░░░ 50% | Неделя: ██░░░░ 25% | S: 🔴85%');
  });

  it('does not append Sonnet block when missing', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 }, 'ru');
    expect(result).toBe('Claude: Сессия: ███░░░ 50% | Неделя: ██░░░░ 25%');
  });

  it('shows Sonnet without emoji below 60%', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25, sevenDaySonnet: 10 }, 'ru');
    expect(result).toBe('Claude: Сессия: ███░░░ 50% | Неделя: ██░░░░ 25% | S: 10%');
  });

  it('uses English labels with Sonnet block', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25, sevenDaySonnet: 85 }, 'en');
    expect(result).toBe('Claude: Session: ███░░░ 50% | Week: ██░░░░ 25% | S: 🔴85%');
  });
});

describe('formatSevenDaySonnetText', () => {
  it('returns null when sevenDaySonnet is undefined', () => {
    expect(formatSevenDaySonnetText({ fiveHour: 0, sevenDay: 0 })).toBeNull();
  });

  it('formats Sonnet without emoji when below 60%', () => {
    expect(formatSevenDaySonnetText({ fiveHour: 0, sevenDay: 0, sevenDaySonnet: 25 })).toBe('S: 25%');
  });

  it('formats Sonnet with yellow circle at 65%', () => {
    const limits = { fiveHour: 0, sevenDay: 0, sevenDaySonnet: 65, sevenDaySonnetResetsAt: '2099-01-01T00:00:00Z' };
    expect(formatSevenDaySonnetText(limits)).toBe('S: 🟡65%');
  });

  it('formats Sonnet with red circle at 80%+', () => {
    expect(formatSevenDaySonnetText({ fiveHour: 0, sevenDay: 0, sevenDaySonnet: 85 })).toBe('S: 🔴85%');
  });
});

describe('parseCodexLimits', () => {
  it('parses primary and secondary rate limits from a Codex token_count event', () => {
    const line = JSON.stringify({
      payload: {
        rate_limits: {
          primary: { used_percent: 50.4, window_minutes: 10080, resets_at: 4070908800 },
          secondary: { used_percent: 12.2, window_minutes: 300, resets_at: 4070908800 },
          plan_type: 'plus'
        }
      }
    });

    const result = parseCodexLimitsFromJsonLine(line);
    expect(result?.primary).toMatchObject({ usedPercent: 50, windowMinutes: 10080 });
    expect(result?.secondary).toMatchObject({ usedPercent: 12, windowMinutes: 300 });
    expect(result?.planType).toBe('plus');
  });

  it('uses the latest rate_limits event in a Codex session log', () => {
    const first = JSON.stringify({ payload: { rate_limits: { primary: { used_percent: 10, window_minutes: 10080 } } } });
    const second = JSON.stringify({ payload: { rate_limits: { primary: { used_percent: 25, window_minutes: 10080 } } } });

    const result = parseCodexLimitsFromSessionLog(`${first}\n${second}`);
    expect(result?.primary?.usedPercent).toBe(25);
  });

  it('parses Codex WHAM usage windows', () => {
    const json = JSON.stringify({
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 12.4, limit_window_seconds: 18000, reset_at: 4070908800 },
        secondary_window: { used_percent: 50.1, limit_window_seconds: 604800, reset_at: 4070908800 }
      }
    });

    const result = parseCodexLimitsFromWhamUsage(json);
    expect(result?.primary).toMatchObject({ usedPercent: 12, windowMinutes: 300 });
    expect(result?.secondary).toMatchObject({ usedPercent: 50, windowMinutes: 10080 });
    expect(result?.planType).toBe('plus');
  });

  it('parses the live app-server response with a weekly window only', () => {
    const result = parseCodexLimitsFromAppServerRateLimits({
      primary: { usedPercent: 9, windowDurationMins: 10080, resetsAt: 4070908800 },
      secondary: null,
      planType: 'plus'
    });

    expect(result).toMatchObject({
      primary: { usedPercent: 9, windowMinutes: 10080 },
      secondary: undefined,
      planType: 'plus'
    });
    expect(formatCodexStatusText(result!, 'ru')).toMatch(/^Codex: Неделя: █░░░░░ 9% \(~/);
  });

  it('formats Codex session and week bars with the same labels', () => {
    const result = formatCodexStatusText({
      primary: { usedPercent: 50, windowMinutes: 10080 },
      secondary: { usedPercent: 12, windowMinutes: 300 }
    }, 'en');

    expect(result).toBe('Codex: Session: █░░░░░ 12% | Week: ███░░░ 50%');
  });

  it('includes an individual Codex limit when present', () => {
    const result = formatCodexStatusText({
      primary: { usedPercent: 50, windowMinutes: 10080 },
      secondary: { usedPercent: 12, windowMinutes: 300 },
      individual: { usedPercent: 85, windowMinutes: 10080, label: 'I' }
    }, 'en');

    expect(result).toBe('Codex: Session: █░░░░░ 12% | Week: ███░░░ 50% | I: 🔴85%');
  });
});

describe('parseCodexAccountLabel', () => {
  function makeToken(claims: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `header.${payload}.signature`;
  }

  it('combines name and email', () => {
    expect(parseCodexAccountLabel(makeToken({ name: 'Сергей', email: 'user@example.com' })))
      .toBe('Сергей (user@example.com)');
  });

  it('falls back to email when the name is missing', () => {
    expect(parseCodexAccountLabel(makeToken({ email: 'user@example.com' }))).toBe('user@example.com');
  });

  it('falls back to name when the email is missing', () => {
    expect(parseCodexAccountLabel(makeToken({ name: 'Сергей' }))).toBe('Сергей');
  });

  it('returns an empty string for tokens without account claims', () => {
    expect(parseCodexAccountLabel(makeToken({ sub: 'abc' }))).toBe('');
  });

  it('returns an empty string for malformed input', () => {
    expect(parseCodexAccountLabel('not-a-jwt')).toBe('');
    expect(parseCodexAccountLabel('header.@@@notbase64@@@.signature')).toBe('');
    expect(parseCodexAccountLabel(undefined)).toBe('');
    expect(parseCodexAccountLabel(null)).toBe('');
  });
});


describe('optional progress bars', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(1793019600000); });
  afterEach(() => { vi.restoreAllMocks(); });
  it.each(['ru', 'en'] as const)('keeps Claude numbers and timers without bars (%s)', lang => {
    const limits = { fiveHour: 10, sevenDay: 30, fiveHourResetsAt: new Date(Date.now() + 3600000).toISOString() };
    const normal = formatStatusText(limits, lang);
    const compact = formatStatusText(limits, lang, false);
    expect(normal).toMatch(/[█░]/);
    expect(compact).toBe(normal.replace(/[█░]+ /g, ''));
    expect(compact).toContain('10% (~');
    expect(compact).not.toContain('  ');
  });
  it.each(['ru', 'en'] as const)('keeps Codex windows and timers without bars (%s)', lang => {
    const limits = { primary: { usedPercent: 10, windowMinutes: 300, resetsAt: new Date(Date.now() + 3600000).toISOString() }, secondary: { usedPercent: 84, windowMinutes: 10080 } };
    const normal = formatCodexStatusText(limits, lang);
    const compact = formatCodexStatusText(limits, lang, false);
    expect(normal).toMatch(/[█░]/);
    expect(compact).toBe(normal.replace(/[█░]+ /g, ''));
    expect(compact).toContain('84%');
    expect(compact).not.toContain('  ');
  });
});

describe('view options', () => {
  const limits = { fiveHour: 42, sevenDay: 18, sevenDaySonnet: 5 };

  it('keeps the current words output by default', () => {
    expect(formatStatusText(limits, 'en', false)).toBe('Claude: Session: 42% | Week: 18% | S: 5%');
  });

  it('uses letters and 5h labels', () => {
    expect(formatStatusText(limits, 'en', false, { labels: 'letters' })).toBe('Claude: S: 42% | W: 18% | Sn: 5%');
    expect(formatStatusText(limits, 'en', false, { labels: 'letters', shortWindowLabel: '5h' })).toBe('Claude: 5h: 42% | W: 18% | S: 5%');
    expect(formatStatusText(limits, 'en', false, { shortWindowLabel: '5h' })).toBe('Claude: 5h: 42% | Week: 18% | S: 5%');
    expect(formatStatusText(limits, 'ru', false, { labels: 'letters' })).toBe('Claude: С: 42% | Н: 18% | S: 5%');
    expect(formatStatusText(limits, 'ru', false, { shortWindowLabel: '5h' })).toBe('Claude: 5ч: 42% | Неделя: 18% | S: 5%');
  });

  it('keeps progress bars with letters', () => {
    expect(formatStatusText({ fiveHour: 50, sevenDay: 25 }, 'en', true, { labels: 'letters' })).toBe('Claude: S: ███░░░ 50% | W: ██░░░░ 25%');
  });

  it('hides service names', () => {
    expect(formatStatusText(limits, 'en', false, { labels: 'letters', shortWindowLabel: '5h', showServiceNames: false })).toBe('5h: 42% | W: 18% | S: 5%');
    const codex = { primary: { usedPercent: 12, windowMinutes: 300 }, secondary: { usedPercent: 50, windowMinutes: 10080 } };
    expect(formatCodexStatusText(codex, 'en', false, { labels: 'letters', showServiceNames: false })).toBe('S: 12% | W: 50%');
    expect(formatCodexStatusText(codex, 'en', false, { shortWindowLabel: '5h' })).toBe('Codex: 5h: 12% | Week: 50%');
  });

  it('renders every combination of view settings in both languages', () => {
    for (const lang of ['en', 'ru'] as const)
      for (const labels of ['words', 'letters'] as const)
        for (const shortWindowLabel of ['session', '5h'] as const)
          for (const showServiceNames of [true, false])
            for (const bars of [true, false]) {
              const text = formatStatusText(limits, lang, bars, { labels, shortWindowLabel, showServiceNames });
              expect(text.startsWith('Claude: ')).toBe(showServiceNames);
              expect(/[█░]/.test(text)).toBe(bars);
              const first = shortWindowLabel === '5h'
                ? (lang === 'en' ? '5h' : '5ч')
                : labels === 'letters' ? (lang === 'en' ? 'S' : 'С') : (lang === 'en' ? 'Session' : 'Сессия');
              expect(text.replace('Claude: ', '').startsWith(first + ': ')).toBe(true);
              const sonnet = lang === 'en' && labels === 'letters' && shortWindowLabel === 'session' ? 'Sn' : 'S';
              expect(text.endsWith(`| ${sonnet}: 5%`)).toBe(true);
            }
  });
});

describe('Kimi usage', () => {
  const live = JSON.stringify({
    limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '5', remaining: '95', resetTime: '2026-11-01T17:44:53.684695Z' } }],
    usages: {
      limit_5h: { used_ratio: 0.0524, reset_time: '2026-11-01T17:44:52Z' },
      limit_month_total: { used_ratio: 0.0065, reset_time: '2026-12-02T00:00:00Z' },
      limit_month_code: { used_ratio: 0.0065, reset_time: '2026-12-02T00:00:00Z' },
    },
  });

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T15:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('parses the live response', () => {
    expect(parseKimiUsage(live)).toEqual({
      fiveHour: { usedPercent: 5, resetsAt: '2026-11-01T17:44:52Z' },
      month: { usedPercent: 1, resetsAt: '2026-12-02T00:00:00Z' },
    });
  });

  it('reads a weekly window and ratios sent as strings', () => {
    expect(parseKimiUsage(JSON.stringify({ usages: { limit_7d: { used_ratio: '0.5' } } }))).toEqual({ sevenDay: { usedPercent: 50 } });
  });

  it('returns null for empty, broken and windowless responses', () => {
    for (const body of ['', '{', 'null', '{}', '{"usages":{}}', '{"usages":{"limit_5h":{}}}']) {
      expect(parseKimiUsage(body)).toBeNull();
    }
  });

  it('formats session and month', () => {
    expect(formatKimiStatusText(parseKimiUsage(live)!, 'en', false)).toBe('Kimi: Session: 5% (~2ч) | Month: 1% (~30д9ч)');
    expect(formatKimiStatusText(parseKimiUsage(live)!, 'en', false, { labels: 'letters', showServiceNames: false })).toBe('S: 5% (~2ч) | M: 1% (~30д9ч)');
  });

  it('shows a window whose reset already passed as 0%', () => {
    vi.setSystemTime(new Date('2026-11-01T18:00:00Z'));
    expect(formatKimiStatusText(parseKimiUsage(live)!, 'en', false, { labels: 'letters' })).toBe('Kimi: S: 0% | M: 1% (~30д6ч)');
  });
});

describe('parseKimiAccountLabel', () => {
  it('combines nickname and email like the other services', () => {
    expect(parseKimiAccountLabel(JSON.stringify({ user_id: 'u1', nickname: 'Sergey', email: 'me@example.com' }))).toBe('Sergey (me@example.com)');
  });

  it('falls back to whichever field is present', () => {
    expect(parseKimiAccountLabel(JSON.stringify({ email: 'me@example.com' }))).toBe('me@example.com');
    expect(parseKimiAccountLabel(JSON.stringify({ nickname: 'Sergey', email: '' }))).toBe('Sergey');
  });

  it('returns an empty string for broken or empty responses', () => {
    for (const body of ['', '{', 'null', '{}']) expect(parseKimiAccountLabel(body)).toBe('');
  });
});
