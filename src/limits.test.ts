import { describe, it, expect } from 'vitest';
import { parseLimits, formatProgressBar, getColor, formatStatusText } from './limits';

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

describe('formatStatusText', () => {
  it('formats both limits with progress bars', () => {
    const result = formatStatusText({ fiveHour: 50, sevenDay: 25 });
    expect(result).toBe('Сессия: ███░░░ 50% | Неделя: ██░░░░ 25%');
  });

  it('handles 0% values', () => {
    const result = formatStatusText({ fiveHour: 0, sevenDay: 0 });
    expect(result).toBe('Сессия: ░░░░░░ 0% | Неделя: ░░░░░░ 0%');
  });
});
