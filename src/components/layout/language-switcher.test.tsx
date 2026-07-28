import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageSwitcher } from './language-switcher';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/zh/dashboard' as string,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'header.language' ? '语言' : key,
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.pathname = '/zh/dashboard';
  });

  it('shows the current flag and language name in the trigger', async () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByTestId('language-switcher-trigger');
    expect(trigger).toHaveAccessibleName('语言');
    expect(trigger).toHaveTextContent('🇨🇳');
    expect(trigger).toHaveTextContent('中文');
    expect(trigger).toHaveClass('h-8', 'border', 'px-3');

    fireEvent.click(trigger);
    const chinese = await screen.findByTestId('language-switcher-option-zh');
    const english = await screen.findByTestId('language-switcher-option-en');

    expect(chinese).toHaveAttribute('aria-current', 'true');
    expect(chinese).toHaveClass('bg-primary/10', 'text-primary', 'py-1.5');
    expect(chinese).not.toHaveClass('bg-accent');

    fireEvent.click(english);

    expect(mocks.push).toHaveBeenCalledWith('/en/dashboard');
  });

  it('keeps hidden-but-supported locales truthful on direct routes', () => {
    mocks.pathname = '/ru/dashboard';
    render(<LanguageSwitcher />);

    const trigger = screen.getByTestId('language-switcher-trigger');
    expect(trigger).toHaveTextContent('🇷🇺');
    expect(trigger).toHaveTextContent('Русский');
  });
});
