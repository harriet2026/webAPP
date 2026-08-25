export function createTimeAxisFormatter(locale: string, includeDate: boolean) {
  const formatter = new Intl.DateTimeFormat(locale, includeDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatter.format(date);
  };
}
