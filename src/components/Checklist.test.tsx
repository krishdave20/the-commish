import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import { Checklist } from './Checklist';

describe('Checklist', () => {
  it('renders checkbox tasks and reports toggles', async () => {
    const onToggle = vi.fn();
    render(<Checklist label="Prep" onToggle={onToggle} items={[
      { id: 'a', label: 'Study tiers', done: true },
      { id: 'b', label: 'Run a mock draft', done: false },
    ]} />);
    expect(screen.getByRole('list', { name: 'Prep' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Study tiers' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Run a mock draft' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Run a mock draft' }));
    expect(onToggle).toHaveBeenCalledWith('b');
  });
});
