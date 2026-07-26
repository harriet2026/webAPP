const mockSecurityCsvTotals = [64, 67, 70, 73, 76, 79, 82];

export const mockSecurityCsv = [
  'date,email_type,total,block_rate,change,change_pct',
  ...['11/1', '11/2', '11/3', '11/4', '11/5', '11/6', '11/7'].map((date, index) => {
    const total = mockSecurityCsvTotals[index];
    const previous = index > 0 ? mockSecurityCsvTotals[index - 1] : 0;
    const change = index > 0 ? total - previous : 0;
    const changePct = previous > 0 ? (change / previous) * 100 : 0;
    return `${date},phishing,${total},${(96.2 + (index % 3) * 0.7).toFixed(1)},${change},${changePct.toFixed(2)}`;
  }),
].join('\n');

export const mockSecurityAiMarkdown = '## 安全态势结论\n\n- 本周期拦截率为 **97.2%**，处于关注区间。\n- 钓鱼与垃圾邮件构成主要威胁，攻击高峰集中在 13:00–14:00。\n- 建议优先复核待审队列，并持续关注主要来源地区。';
