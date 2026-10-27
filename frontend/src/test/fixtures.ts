import type { AgentBooking, AgentSession, BookingPage, ClientSession, Receipt } from '../api';

export const agentSession: AgentSession = {
  agent_id: 1,
  name: 'Jane Rivera',
  email: 'jane@example.com',
  slug: 'jane',
  timezone: 'America/New_York',
  brand_name: 'Jane Rivera Homes',
};

export const clientSession: ClientSession = {
  client_id: 1,
  name: 'Alex Chen',
  email: 'client@example.com',
  phone: '555-0100',
};

export const bookingPage: BookingPage = {
  slug: 'jane',
  brand_name: 'Jane Rivera Homes',
  agent_name: 'Jane Rivera',
  timezone: 'America/New_York',
  has_hours: true,
  properties: ['12 Oak Street'],
  meeting_types: [
    {
      meeting_type_id: 1,
      name: 'Consultation',
      duration_minutes: 30,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      location: 'video',
    },
    {
      meeting_type_id: 2,
      name: 'Showing',
      duration_minutes: 60,
      buffer_before_minutes: 0,
      buffer_after_minutes: 15,
      location: 'in_person',
    },
  ],
};

export const receipt: Receipt = {
  status: 'confirmed',
  slot_start: '2026-10-27T15:00:00.000Z',
  slot_end: '2026-10-27T15:30:00.000Z',
  meeting_type_name: 'Consultation',
  duration_minutes: 30,
  location: 'video',
  brand_name: 'Jane Rivera Homes',
  agent_timezone: 'America/New_York',
  client_name: 'Alex Chen',
  intake_note: '12 Oak Street',
  slug: 'jane',
};

export const agentBooking: AgentBooking = {
  booking_id: 1,
  meeting_type_id: 1,
  meeting_type_name: 'Consultation',
  duration_minutes: 30,
  location: 'video',
  slot_start: '2026-10-27T15:00:00.000Z',
  slot_end: '2026-10-27T15:30:00.000Z',
  client_name: 'Alex Chen',
  client_email: 'alex@example.com',
  client_phone: '555-0100',
  intake_note: '12 Oak Street',
  status: 'confirmed',
};
