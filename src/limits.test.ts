import { describe, it, expect } from 'vitest';
import { parseLimits, formatProgressBar, getColor, getStatusEmoji, formatStatusText, formatSevenDaySonnetText } from './limits';

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
  it('shows no emoji below 60%', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: ██░░░░ 25%');
  });

  it('handles 0% values without emoji', () => {
    const result = formatStatusText({ fiveHour: 0, sevenDay: 0 });
    expect(result).toBe('Сессия: ░░░░░░ 0% | Неделя: ░░░░░░ 0%');
  });

  it('shows yellow circle in 60-79% range', () => {
    const result = formatStatusText({ fiveHour: 65, sevenDay: 25 });
    expect(result).toBe('Сессия: ████░░ 🟡65% | Неделя: ██░░░░ 25%');
  });

  it('shows red circle at 80%+', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 85 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: █████░ 🔴85%');
  });

  it('appends Sonnet block when sevenDaySonnet is present', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25, sevenDaySonnet: 85 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: ██░░░░ 25% | S: 🔴85%');
  });

  it('does not append Sonnet block when missing', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: ██░░░░ 25%');
  });

  it('shows Sonnet without emoji below 60%', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25, sevenDaySonnet: 10 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: ██░░░░ 25% | S: 10%');
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
