'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function ReleasePage() {
  const t = useTranslations('portalRelease');
  const params = useParams();
  const sp = useSearchParams();
  const id = params.id as string;
  const token = sp?.get('token') ?? '';
  const [status, setStatus] = useState<'loading' | 'ready' | 'released' | 'error' | 'expired'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    fetch(`/api/portal/quarantine/${id}/release?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 200) setStatus('ready');
        else if (r.status === 401) setStatus('expired');
        else setStatus('error');
      })
      .catch(() => setStatus('error'));
  }, [id, token]);

  const handleConfirm = async () => {
    setStatus('loading');
    try {
      const r = await fetch(`/api/portal/quarantine/${id}/release?token=${encodeURIComponent(token)}`, { method: 'POST' });
      if (r.ok) {
        setStatus('released');
      } else if (r.status === 409) {
        setErrMsg(t('alreadyReleased'));
        setStatus('error');
      } else if (r.status === 401) {
        setStatus('expired');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{t('loading')}</span>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-red-600 mb-2">{t('expiredTitle')}</h2>
        <p className="text-slate-500 text-sm">{t('expiredDesc')}</p>
      </div>
    );
  }

  if (status === 'released') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-green-600 mb-2">{t('releasedTitle')}</h2>
        <p className="text-slate-500 text-sm">{t('releasedDesc')}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-red-600 mb-2">{t('errorTitle')}</h2>
        <p className="text-slate-500 text-sm">{errMsg || t('errorDesc')}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">{t('confirmTitle')}</h1>
      <p className="mb-4 text-slate-600 text-sm">{t('mailIdLabel')}: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{id}</span></p>
      <button
        className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md hover:bg-blue-700 transition-colors font-medium"
        onClick={handleConfirm}
      >
        {t('confirmButton')}
      </button>
    </div>
  );
}
