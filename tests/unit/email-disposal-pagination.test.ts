import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GT-13304 邮件处置中心分页选项', () => {
  it('默认每页条数必须可以从下拉框重新选择', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/email-disposal/email-disposal-center-page.tsx'),
      'utf-8',
    );
    const defaultMatch = source.match(
      /const \[pageSize, setPageSize\] = useState\((\d+)\)/,
    );
    const optionsMatch = source.match(/pageSizeOptions=\{\[([\d,\s]+)\]\}/);

    expect(defaultMatch, '未找到分页默认值').toBeTruthy();
    expect(optionsMatch, '未找到分页下拉选项').toBeTruthy();

    const defaultPageSize = Number(defaultMatch![1]);
    const options = optionsMatch![1]
      .split(',')
      .map((value) => Number(value.trim()));

    expect(options).toContain(defaultPageSize);
  });
});
