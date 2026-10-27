import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type BookingPageLink } from '../api';
import { bookingPage } from '../test/fixtures';
import ClientBookPage from './ClientBookPage';

const jane: BookingPageLink = {
  slug: 'jane',
  brand_name: 'Jane Rivera Homes',
  agent_name: 'Jane Rivera',
};

const sam: BookingPageLink = {
  slug: 'sam',
  brand_name: 'Sam Lee',
  agent_name: 'Sam Lee',
};

function renderBook(path = '/client/book') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/client/book" element={<ClientBookPage />} />
        <Route path="/client/book/:slug" element={<ClientBookPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ClientBookPage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listBookingPages').mockResolvedValue([jane, sam]);
    vi.spyOn(api, 'bookingPage').mockResolvedValue(bookingPage);
    vi.spyOn(api, 'availableDates').mockResolvedValue([]);
    vi.spyOn(api, 'availableSlots').mockResolvedValue([]);
  });

  it('waits for the realtor list before opening a page', async () => {
    const pending = deferred<BookingPageLink[]>();
    vi.mocked(api.listBookingPages).mockReturnValue(pending.promise);
    renderBook('/client/book/jane');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(api.bookingPage).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve([jane, sam]);
    });
    expect(await screen.findByRole('heading', { name: 'Jane Rivera' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All realtors' })).toHaveAttribute(
      'href',
      '/client/book',
    );
  });

  it('lists realtors and hides a repeated name', async () => {
    renderBook();
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Jane Rivera Homes');
    expect(items[0]).toHaveTextContent('· Jane Rivera');
    expect(items[1]).toHaveTextContent('Sam Lee');
    expect(items[1]).not.toHaveTextContent('·');
    const links = screen.getAllByRole('link', { name: 'Book' });
    expect(links[0]).toHaveAttribute('href', '/client/book/jane');
    expect(links[1]).toHaveAttribute('href', '/client/book/sam');
    expect(
      screen.getByText(
        'Choose a realtor to book a demo. Appointments you book show up under Appointments.',
      ),
    ).toBeInTheDocument();
  });

  it('opens the only realtor without asking', async () => {
    vi.mocked(api.listBookingPages).mockResolvedValue([jane]);
    renderBook();
    expect(await screen.findByRole('heading', { name: 'Jane Rivera' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All realtors' })).not.toBeInTheDocument();
  });

  it('says when no realtor has a booking page', async () => {
    vi.mocked(api.listBookingPages).mockResolvedValue([]);
    renderBook();
    expect(await screen.findByText('No open booking pages.')).toBeInTheDocument();
    expect(
      screen.getByText('When a realtor has hours and a meeting type, they will show up here.'),
    ).toBeInTheDocument();
  });

  it('says when the realtor list cannot be loaded', async () => {
    vi.mocked(api.listBookingPages).mockRejectedValue(new ApiError(0, 'network', 'offline'));
    renderBook();
    expect(await screen.findByText('Couldn’t load booking pages.')).toBeInTheDocument();
    expect(
      screen.getByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
  });
});
