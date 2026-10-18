import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY, resetThemeMemory } from '../app/theme';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  resetThemeMemory();
});
afterEach(cleanup);

describe('ThemeToggle', () => {
  it('is a button named for the current appearance, system by default', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'appearance: system' });
    expect(btn).toHaveAttribute('title', 'appearance: system (click for light)');
    expect(btn).toHaveClass('theme-toggle');
  });

  it('cycles system, light, dark, system, and the accessible name follows', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'appearance: system' }));
    expect(screen.getByRole('button', { name: 'appearance: light' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');

    await user.click(screen.getByRole('button', { name: 'appearance: light' }));
    expect(screen.getByRole('button', { name: 'appearance: dark' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'appearance: dark' }));
    expect(screen.getByRole('button', { name: 'appearance: system' })).toBeInTheDocument();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('draws a decorative icon, so the name is the only text', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(btn).toHaveTextContent('');
  });

  it('two toggles stay in step', async () => {
    const user = userEvent.setup();
    render(<><ThemeToggle /><ThemeToggle className="second" /></>);
    await user.click(screen.getAllByRole('button')[0]!);
    expect(screen.getAllByRole('button', { name: 'appearance: light' })).toHaveLength(2);
  });
});
