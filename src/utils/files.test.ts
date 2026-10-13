import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvCell, today } from './files';

afterEach(() => vi.useRealTimers());

describe('CSV exports', () => {
  it.each([
    '=HYPERLINK("https://example.com")',
    '+SUM(1,2)',
    '-1+1',
    '@SUM(A1)',
    '  =1+1',
    '\t=1+1',
    '\r=1+1',
  ])('prevents spreadsheet evaluation of %j', (value) => {
    const escaped = csvCell(value);
    expect(escaped.startsWith('"\'')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
  });

  it('preserves Chinese, embedded quotes, commas and newlines as one quoted cell', () => {
    expect(csvCell('今天说：“你好”, 然后倾听\n第二行')).toBe('"今天说：“你好”, 然后倾听\n第二行"');
    expect(csvCell('他说 "hello", then listened')).toBe('"他说 ""hello"", then listened"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(15)).toBe('"15"');
  });
});

describe('local calendar dates', () => {
  it('uses the calendar day near both ends of local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 0, 1));
    expect(today()).toBe('2026-10-13');
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59));
    expect(today()).toBe('2026-10-13');
  });

  it('keeps date-only values on the same calendar day in a browser west of UTC', () => {
    // A child process supplies a real timezone independently of the test worker's
    // locale. Node's type stripping loads the exact application helper unchanged.
    const file = pathToFileURL(resolve('src/utils/files.ts')).href;
    const script = `import { today, shortDate } from ${JSON.stringify(file)};
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...args) { if (args.length) super(...args); else super('2026-10-14T00:30:00Z'); }
      };
      process.stdout.write(JSON.stringify({today:today(), short:shortDate('2026-10-13')}));`;
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      {
        env: { ...process.env, TZ: 'America/Los_Angeles' },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ today: '2026-10-13', short: '10月13日' });
  });
});
