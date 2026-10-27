import { useParams } from 'react-router';
import { api, useLoad } from '../api';
import { SoloShell } from '../ui/SoloShell';
import { BookingView } from './BookingView';

export default function BookPage() {
  const { slug = '' } = useParams();
  const page = useLoad(`page|${slug}`, () => api.bookingPage(slug));
  const brand = page.data
    ? { name: page.data.brand_name, to: `/book/${page.data.slug}` }
    : page.data === null
      ? { name: 'Book', to: `/book/${slug}` }
      : null;

  return (
    <SoloShell brand={brand}>
      <BookingView slug={slug} variant="public" />
    </SoloShell>
  );
}
