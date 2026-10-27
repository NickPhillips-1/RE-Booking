import { CalendarPlus } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { api, errorMessage, useLoad } from '../api';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { BookingView } from './BookingView';

export default function ClientBookPage() {
  const { slug } = useParams();
  const pages = useLoad('booking-pages', () => api.listBookingPages());

  if (pages.error) {
    return (
      <>
        <title>Book</title>
        <EmptyState title="Couldn’t load booking pages." description={errorMessage(pages.error)} />
      </>
    );
  }

  if (pages.data === undefined) {
    return (
      <>
        <title>Book</title>
        <p className="quiet" role="status">
          Loading…
        </p>
      </>
    );
  }

  if (slug) {
    return (
      <BookingView
        slug={slug}
        variant="client"
        actions={
          pages.data.length > 1 ? (
            <Link className="button" to="/client/book">
              All realtors
            </Link>
          ) : undefined
        }
      />
    );
  }

  if (pages.data.length === 1) {
    return <Navigate to={`/client/book/${pages.data[0].slug}`} replace />;
  }

  if (pages.data.length === 0) {
    return (
      <>
        <title>Book</title>
        <PageHeader
          title="Book"
          description="Book a demo with a realtor. Appointments you book show up under Appointments."
        />
        <EmptyState
          icon={<CalendarPlus />}
          title="No open booking pages."
          description="When a realtor has hours and a meeting type, they will show up here."
        />
      </>
    );
  }

  return (
    <>
      <title>Book</title>
      <PageHeader
        title="Book"
        description="Choose a realtor to book a demo. Appointments you book show up under Appointments."
      />
      <section aria-label="Realtors">
        <ul className="rows">
          {pages.data.map((page) => (
            <li key={page.slug}>
              <span className="row-value">
                {page.brand_name}
                {page.brand_name.trim() !== page.agent_name.trim() && (
                  <span className="quiet"> · {page.agent_name}</span>
                )}
              </span>
              <Link className="button" to={`/client/book/${page.slug}`}>
                Book
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
