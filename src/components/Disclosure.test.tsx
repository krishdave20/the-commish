import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Disclosure } from './Disclosure';

afterEach(cleanup);

describe('Disclosure', () => {
  it('is closed until its title is clicked, and keeps the title as a heading', async () => {
    const user = userEvent.setup();
    render(<Disclosure title="cache" hint="3 entries"><p>total size</p></Disclosure>);
    expect(screen.getByRole('heading', { level: 2, name: 'cache' })).toBeInTheDocument();
    expect(screen.getByText('total size')).not.toBeVisible();
    await user.click(screen.getByText('cache'));
    expect(screen.getByText('total size')).toBeVisible();
    expect(screen.getByText('3 entries')).toBeInTheDocument();
  });

  it('can start open and be inline (a link-like summary with no heading)', () => {
    render(<Disclosure title="why it matters" inline defaultOpen><p>detail</p></Disclosure>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('detail')).toBeVisible();
  });
});
