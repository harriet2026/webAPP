export interface WeeklyMatrixCell {
  day: number;
  hour: number;
  value: number;
}

export const WEEKLY_MATRIX_DAYS = 7;
export const WEEKLY_MATRIX_HOURS = 24;

// GT-12587：周内热力图必须是完整的 7×24。后端 buildWeeklyMatrix 现在恒返回
// 168 个格子，但旧版本 apiserver 会返回稀疏矩阵——只有真的有邮件的小时才有
// 格子。图表的 xAxis 固定 24 列而 splitArea 的交替底色里有一档是 transparent，
// 空列因此完全看不出来，表现就是"切到周内只显示 7 列"。
//
// 这里做防御性补齐，让前端不依赖后端版本。越界格子丢弃而不是钳位——钳位会
// 把脏数据算进某个真实格子里，静默污染统计。
export function padWeeklyMatrix(raw: readonly WeeklyMatrixCell[]): WeeklyMatrixCell[] {
  const byCell = new Map<string, number>();
  for (const cell of raw) {
    if (cell.day < 0 || cell.day >= WEEKLY_MATRIX_DAYS) continue;
    if (cell.hour < 0 || cell.hour >= WEEKLY_MATRIX_HOURS) continue;
    byCell.set(`${cell.day}:${cell.hour}`, cell.value);
  }
  const padded: WeeklyMatrixCell[] = [];
  for (let day = 0; day < WEEKLY_MATRIX_DAYS; day += 1) {
    for (let hour = 0; hour < WEEKLY_MATRIX_HOURS; hour += 1) {
      padded.push({ day, hour, value: byCell.get(`${day}:${hour}`) ?? 0 });
    }
  }
  return padded;
}
