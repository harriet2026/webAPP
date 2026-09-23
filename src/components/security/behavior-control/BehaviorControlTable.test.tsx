import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';

import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import zh from '@/../messages/zh.json';
import { BehaviorControlTable } from './BehaviorControlTable';

afterEach(cleanup);

describe('BehaviorControlTable empty state', () => {
  it.each([
    ['zh', zh],
    ['en', en],
    ['ru', ru],
    ['th', th],
  ] as const)('GT-13693: %s points users to the named create action without stale position guidance', (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <BehaviorControlTable
          views={[]}
          onEdit={() => undefined}
          onDelete={() => undefined}
          onToggle={() => undefined}
        />
      </NextIntlClientProvider>,
    );

    const emptyState = screen.getByTestId('behavior-control-empty');
    expect(emptyState).toHaveTextContent(messages.behaviorControl.empty);
    expect(emptyState).toHaveTextContent(messages.behaviorControl.addRule);
    expect(emptyState.textContent).not.toMatch(/下方|below|ниже|ด้านล่าง/i);
  });
});
