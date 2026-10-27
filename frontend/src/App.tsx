import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { useAgentToken, useClientToken } from './auth';
import BookPage from './pages/BookPage';
import ClientBookPage from './pages/ClientBookPage';
import ClientLayout from './pages/ClientLayout';
import ClientPage from './pages/ClientPage';
import ConfirmedPage from './pages/ConfirmedPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import HoursPage from './pages/dashboard/HoursPage';
import MeetingsPage from './pages/dashboard/MeetingsPage';
import SchedulePage from './pages/dashboard/SchedulePage';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/book/:slug" element={<BookPage />} />
      <Route path="/book/:slug/confirmed" element={<ConfirmedPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/guest" element={<Navigate to="/client" replace />} />
      <Route
        path="/client"
        element={
          <RequireClient>
            <ClientLayout />
          </RequireClient>
        }
      >
        <Route index element={<ClientPage />} />
        <Route path="book" element={<ClientBookPage />} />
        <Route path="book/:slug" element={<ClientBookPage />} />
      </Route>
      <Route
        path="/dashboard"
        element={
          <RequireAgent>
            <DashboardLayout />
          </RequireAgent>
        }
      >
        <Route index element={<SchedulePage />} />
        <Route path="hours" element={<HoursPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function RequireAgent({ children }: { children: ReactNode }) {
  const token = useAgentToken();
  return token ? children : <Navigate to="/login" replace />;
}

function RequireClient({ children }: { children: ReactNode }) {
  const token = useClientToken();
  return token ? children : <Navigate to="/login?as=client" replace />;
}

function NotFound() {
  return (
    <main className="page">
      <h1 className="title">Page not found</h1>
      <p>
        <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
