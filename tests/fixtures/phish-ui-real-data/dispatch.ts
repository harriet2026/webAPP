import { cliMockDetail } from './mock-detail';
import { serviceMail7Zh, serviceMail8Zh } from './zh';

const details = [cliMockDetail, serviceMail8Zh, serviceMail7Zh];

// An independent opt-in fixture set; the existing mock dispatcher stays intact.
export function dispatchPhishAssessmentPreview(method: string, path: string) {
  if (method !== 'GET') return undefined;
  const url = new URL(path, 'http://fixture.invalid');
  if (url.pathname === '/phishing-agent/stats') return { status: 200, data: {
    today_detected: 3, today_quarantined: 3, pending_review: 0, today_recalled: 0, recall_success: 0,
  } };
  if (url.pathname === '/phishing-agent/detection-logs') {
    const keyword = url.searchParams.get('keyword')?.toLowerCase();
    const items = details.map((detail) => detail.summary).filter((item) => {
      if (keyword && !`${item.subject} ${item.sender} ${item.recipients.join(' ')}`.toLowerCase().includes(keyword)) return false;
      for (const field of ['risk_level', 'disposition', 'detection_mode', 'recall_status'] as const) {
        const values = url.searchParams.getAll(field);
        if (values.length && !values.includes(item[field] ?? '')) return false;
      }
      const statuses = url.searchParams.getAll('mail_status');
      return !statuses.length || item.display_statuses.some((entry) => statuses.includes(entry.status));
    });
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size')) || 20);
    return { status: 200, data: { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize } };
  }
  if (url.pathname.startsWith('/phishing-agent/detection-logs/')) {
    const id = url.pathname.split('/').at(-1);
    const detail = details.find((item) => item.summary.sideline_id === id);
    return detail ? { status: 200, data: detail } : { status: 404, data: { message: 'Preview detail not found' } };
  }
  return undefined;
}
