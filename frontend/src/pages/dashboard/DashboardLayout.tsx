import '@fontsource-variable/inter';
import '../../dashboard.css';
import { CalendarDays, Clock, LucideProvider, Video } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { api, errorMessage, useLoad } from '../../api';
import { logOut } from '../../auth';
import { AccountMenu } from '../../ui/AccountMenu';

const LINKS = [
  { to: '/dashboard', label: 'Schedule', icon: <CalendarDays /> },
  { to: '/dashboard/hours', label: 'Hours', icon: <Clock /> },
  { to: '/dashboard/meetings', label: 'Meetings', icon: <Video /> },
];

export default function DashboardLayout() {
  const [attempt, setAttempt] = useState(0);
  const session = useLoad(`session|${attempt}`, () => api.agentSession());
  const agent = session.data;
  const mainRef = useRef<HTMLElement>(null);

  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <LucideProvider size={16} strokeWidth={1.75}>
      <div className="shell">
        <a className="skip-link" href="#main" onClick={skipToContent}>
          Skip to content
        </a>

        <header className="shell-topbar">
          {agent ? (
            <Link className="shell-brand" to="/dashboard">
              <span className="shell-brand-mark" aria-hidden="true">
                {[...agent.brand_name.trim()][0]?.toUpperCase()}
              </span>
              <span className="shell-brand-name">{agent.brand_name}</span>
            </Link>
          ) : (
            <span className="shell-brand" aria-hidden="true">
              <span className="skeleton skeleton-mark" />
              <span className="skeleton skeleton-brand" />
            </span>
          )}
          {agent && (
            <AccountMenu name={agent.name} email={agent.email} role="Realtor" onLogOut={logOut} />
          )}
        </header>

        <nav className="shell-sidebar" aria-label="Dashboard">
          <ul className="nav-list">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink className="nav-link" to={link.to} end>
                  {link.icon}
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="shell-main" id="main" ref={mainRef} tabIndex={-1}>
          {agent ? (
            <Outlet context={agent} />
          ) : session.error !== undefined ? (
            <div className="shell-status" role="alert">
              <p className="error">{errorMessage(session.error)}</p>
              <button
                type="button"
                className="button small"
                onClick={() => setAttempt((current) => current + 1)}
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="quiet" role="status">
              Loading…
            </p>
          )}
        </main>
      </div>
    </LucideProvider>
  );
}
