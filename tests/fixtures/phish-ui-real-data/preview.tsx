import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../../messages/zh.json';
import { AssessmentReportView } from '@/components/agent-center/assessment-report';
import { InvestigationAssessment } from '@/components/phishing-detection/investigation-assessment';
import '@/app/globals.css';
import { serviceMail7Zh, serviceMail8Zh } from './zh';
import { cliMockDetail } from './mock-detail';

function Preview() {
  const [scenario, setScenario] = useState('cli');
  const [dark, setDark] = useState(false);
  const detail = scenario === 'cli' ? cliMockDetail : scenario === 'mail7' ? serviceMail7Zh : serviceMail8Zh;
  return <NextIntlClientProvider locale="zh" messages={zh}>
    <div className={dark ? 'dark' : ''}>
      <main className="min-h-screen bg-background p-4 text-foreground">
        <div className="mx-auto max-w-[720px] space-y-4">
          <header className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h1 className="text-lg font-semibold">邮件研判 · 真实数据预览</h1>
            <div className="flex flex-wrap items-center gap-3">
              <select aria-label="预览场景" className="min-w-0 max-w-full rounded-md border border-input bg-background p-2 text-sm" value={scenario} onChange={(event) => setScenario(event.target.value)}>
                <option value="cli">CLI 真实报告 + Mock 定级/处置</option>
                <option value="mail7">历史邮件 7：报告超出预算</option>
                <option value="mail8">历史邮件 8：报告引用无效</option>
              </select>
              <button className="rounded-md border border-input px-3 py-2 text-sm" onClick={() => setDark(!dark)}>{dark ? '浅色' : '深色'}</button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{scenario === 'cli' ? '模型报告来自真实 CLI 复跑；中危定级、隔离策略和已隔离状态为按接口格式补充的 Mock。' : '该场景使用历史服务端详情。中文摘要为展示翻译，风险等级、策略、分值及报告失败原因保持原样。'}</p>
          </header>
          <InvestigationAssessment key={scenario} summary={detail.summary} investigation={detail.investigation!} />
          <AssessmentReportView result={detail.investigation?.result} layout="findings" />
        </div>
      </main>
    </div>
  </NextIntlClientProvider>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
