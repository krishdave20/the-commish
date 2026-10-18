import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { InfoTip } from './InfoTip';

afterEach(cleanup);

function Tip({ open = false }: { open?: boolean }) {
  return (
    <div className="title-row">
      <h2>playoff odds</h2>
      <InfoTip label="playoff odds" defaultOpen={open}>each bar is the chance of making the playoffs.</InfoTip>
    </div>
  );
}

describe('InfoTip', () => {
  it('starts closed: a labelled button, a hidden note', () => {
    render(<Tip />);
    const btn = screen.getByRole('button', { name: 'about playoff odds' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls');
    expect(screen.getByText(/each bar is the chance/)).not.toBeVisible();
  });

  it('toggles the note and reports it with aria-expanded', async () => {
    const user = userEvent.setup();
    render(<Tip />);
    const btn = screen.getByRole('button', { name: 'about playoff odds' });
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/each bar is the chance/)).toBeVisible();
    // the button points at the note
    expect(document.getElementById(btn.getAttribute('aria-controls')!)).toBe(screen.getByRole('note', { hidden: false }));
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/each bar is the chance/)).not.toBeVisible();
  });

  it('opens from the keyboard (Enter and Space) and closes with Esc, keeping focus on the button', async () => {
    const user = userEvent.setup();
    render(<Tip />);
    const btn = screen.getByRole('button', { name: 'about playoff odds' });
    await user.tab();
    expect(btn).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveFocus();
    await user.keyboard(' ');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('can start open', () => {
    render(<Tip open />);
    expect(screen.getByRole('button', { name: 'about playoff odds' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/each bar is the chance/)).toBeVisible();
  });

  it('does not put a visible text label on the button (the "?" is a glyph, hidden from readers)', () => {
    render(<Tip />);
    expect(screen.getByRole('button', { name: 'about playoff odds' }).querySelector('[aria-hidden="true"]')).toHaveTextContent('?');
  });
});
