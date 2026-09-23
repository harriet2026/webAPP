'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScopedApiRequest } from '@/lib/api/client';
import { Field } from './shared';
import { previewContactCSV, uploadContactCSV } from './api';
import type { ContactCSVUploadResult } from './types';

const userFields = ['email', 'display_name', 'dept', 'job_title'] as const;
const deptFields = ['external_id', 'dept_name', 'dept_path', 'parent_external_id'] as const;
const csvTemplates = {
  users: {
    filename: 'contacts-users.csv',
    content: 'email,display_name,dept,job_title\nmember@example.test,Member,dev,Engineer\n',
  },
  departments: {
    filename: 'contacts-departments.csv',
    content: 'external_id,dept_name,parent_external_id\nroot,Headquarters,\ndev,Engineering,root\n',
  },
} as const;

function downloadCSVTemplate(template: keyof typeof csvTemplates) {
  const { filename, content } = csvTemplates[template];
  const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

const aliases: Record<string, string[]> = {
  email: ['email', 'mail', '邮箱', '邮箱地址'], display_name: ['display_name', 'name', '姓名'],
  dept: ['dept', 'dept_id', 'department', 'department_path', 'dept_path', '部门', '部门路径'],
  job_title: ['job_title', 'title', '职务'], external_id: ['external_id', 'id', 'dept_id', '部门id'],
  dept_name: ['dept_name', 'name', '部门名称'], dept_path: ['dept_path', 'path', '部门路径'],
  parent_external_id: ['parent_external_id', 'parent_id', 'parent', '上级部门id'],
};
const mapHeaders = (headers: string[], fields: readonly string[]) => Object.fromEntries(fields.map(field => [field, headers.find(h => aliases[field].includes(h.trim().toLowerCase())) ?? '']));

export function CSVImportFields({ tenantId, onChange }: { tenantId?: number | null; onChange: (config: Record<string, unknown> | null, token: string) => void }) {
  const t = useTranslations('organizationContacts');
  const { apiRequest } = useScopedApiRequest(tenantId ?? null);
  const [userFile, setUserFile] = useState<File | null>(null);
  const [deptFile, setDeptFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<ContactCSVUploadResult | null>(null);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { generation.current++; setUpload(null); setRows([]); setBusy(false); }, [tenantId]);

  const invalidate = () => { generation.current++; setBusy(false); setRows([]); setError(''); onChange(null, ''); };
  const selectFile = (kind: 'user' | 'dept', file: File | null) => {
    invalidate(); setUpload(null);
    if (kind === 'user') setUserFile(file); else setDeptFile(file);
  };
  const uploadFiles = async () => {
    if (!userFile) return;
    invalidate(); const current = generation.current; setBusy(true);
    try {
      const result = await uploadContactCSV(userFile, { tenantId, deptFile: deptFile ?? undefined });
      if (generation.current !== current) return;
      setUpload(result); setUserMap(mapHeaders(result.headers, userFields));
      setDeptMap(deptFile ? mapHeaders(result.dept_headers ?? [], deptFields) : {});
    } catch (e) { if (generation.current === current) setError((e as Error).message); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const preview = async () => {
    if (!upload?.user_file_ref) return;
    invalidate(); const current = generation.current; setBusy(true);
    const config = { user_file_ref: upload.user_file_ref, dept_file_ref: upload.dept_file_ref ?? '', uid_column: '', user_column_map: userMap, ...(upload.dept_file_ref ? { dept_column_map: deptMap } : {}) };
    try {
      const result = await previewContactCSV({ ...config, upload_token: upload.upload_token }, apiRequest);
      if (generation.current !== current) return;
      if (!result.valid || !result.test_token) { setError(t('toastTestFirst')); return; }
      setRows(result.rows); onChange(config, result.test_token);
    } catch (e) { if (generation.current === current) setError((e as Error).message); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const mapping = (fields: readonly string[], headers: string[], values: Record<string, string>, update: (value: Record<string, string>) => void) => fields.map(field => (
    <Field key={field} label={t(`csvFields.${field}`)} required={field === 'email' || field === 'external_id' || field === 'dept_name'}>
      <Select value={values[field] || '__none__'} onValueChange={value => { invalidate(); update({ ...values, [field]: !value || value === '__none__' ? '' : value }); }}>
        <SelectTrigger className="w-full" data-testid={`contacts-csv-map-${field}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="__none__">{t('csvNotMapped')}</SelectItem>{headers.map(header => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  ));
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCSVTemplate('users')} data-testid="contacts-csv-user-template">{t('csvUserTemplate')}</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => downloadCSVTemplate('departments')} data-testid="contacts-csv-dept-template">{t('csvDeptTemplate')}</Button>
    </div>
    <p className="text-sm text-muted-foreground">{t('csvMappingHint')}</p>
    <Field label={t('csvUserFile')} required><Input className="w-full" type="file" accept=".csv" onChange={e => selectFile('user', e.target.files?.[0] ?? null)} data-testid="contacts-source-form-csv-file" /></Field>
    <Field label={t('csvDeptFile')}><Input className="w-full" type="file" accept=".csv" onChange={e => selectFile('dept', e.target.files?.[0] ?? null)} data-testid="contacts-source-form-csv-dept-file" /></Field>
    <Button variant="outline" disabled={!userFile || busy} onClick={uploadFiles} data-testid="contacts-csv-upload">{t('csvUploadAndMap')}</Button>
    {upload && <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{mapping(userFields, upload.headers, userMap, setUserMap)}</div>
      {upload.dept_file_ref && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{mapping(deptFields, upload.dept_headers ?? [], deptMap, setDeptMap)}</div>}
      <Button variant="outline" disabled={busy || !userMap.email || (!!upload.dept_file_ref && (!deptMap.external_id || !deptMap.dept_name))} onClick={preview} data-testid="contacts-csv-preview">{t('csvValidatePreview')}</Button>
      {rows.length > 0 && <div className="overflow-x-auto" data-testid="contacts-csv-preview-rows"><table className="w-full text-sm"><thead><tr>{upload.headers.map(h => <th className="border-b p-2 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border-b p-2" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
