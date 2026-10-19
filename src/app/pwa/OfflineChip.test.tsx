import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineChip } from './OfflineChip';

function setOnline(on: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(on);
  act(() => { window.dispatchEvent(new Event(on ? 'online' : 'offline')); });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('OfflineChip', () => {
  it('says nothing while online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineChip />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows "offline" when the connection drops and goes away when it returns', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineChip />);
    setOnline(false);
    expect(screen.getByRole('status')).toHaveTextContent('offline · showing saved data');
    setOnline(true);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('starts out offline when the page opens without a connection', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineChip />);
    expect(screen.getByText(/offline/)).toBeInTheDocument();
  });
});
