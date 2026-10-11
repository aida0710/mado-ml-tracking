import { describe, expect, it } from 'vitest';
import { parseRevisionParam, reportRevisionUrl } from './reportUrl';

describe('レポートのURL', () => {
  it('バージョンのURLは、そのバージョンを ?revision= で指す', () => {
    expect(
      reportRevisionUrl({ origin: 'https://mmt.example', projectId: 'project-1', reportId: 'report-1', revision: 3 }),
    ).toBe('https://mmt.example/projects/project-1/reports/report-1?revision=3');
  });

  it('?revision= は1以上の整数だけを受け取り、それ以外は最新のバージョン（undefined）にする', () => {
    expect(parseRevisionParam('2')).toBe(2);
    expect(parseRevisionParam(null)).toBeUndefined();
    expect(parseRevisionParam('0')).toBeUndefined();
    expect(parseRevisionParam('1.5')).toBeUndefined();
    expect(parseRevisionParam('abc')).toBeUndefined();
  });
});
