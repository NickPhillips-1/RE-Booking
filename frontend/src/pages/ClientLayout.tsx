import '@fontsource-variable/inter';
import '../dashboard.css';
import { CalendarDays, CalendarPlus, LucideProvider } from 'lucide-react';
import { useRef, type MouseEvent } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { logOut } from '../auth';
import { AccountMenu } from '../ui/AccountMenu';
import { useViewer } from '../viewer';

export default function ClientLayout() {
  const viewer = useViewer();
  const mainRef = useRef<HTMLElement>(null);
  const client = viewer.kind === 'client-account' ? viewer.client : null;

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
          {client ? (
            <Link className="shell-brand" to="/client">
              <span className="shell-brand-mark" aria-hidden="true">
                {[...client.name.trim()][0]?.toUpperCase()}
              </span>
              <span className="shell-brand-name">{client.name}’s Client Dashboard</span>
            </Link>
          ) : viewer.kind === 'unknown' ? (
            <Link className="shell-brand" to="/client">
              <span className="shell-brand-mark" aria-hidden="true">
                C
              </span>
              <span className="shell-brand-name">Client Dashboard</span>
            </Link>
          ) : (
            <span className="shell-brand" aria-hidden="true">
              <span className="skeleton skeleton-mark" />
              <span className="skeleton skeleton-brand" />
            </span>
          )}
          {client ? (
            <AccountMenu name={client.name} email={client.email} role="Client" onLogOut={logOut} />
          ) : viewer.kind === 'unknown' ? (
            <button type="button" className="button small" onClick={logOut}>
              Log out
            </button>
          ) : null}
        </header>

        <nav className="shell-sidebar" aria-label="Client">
          <ul className="nav-list">
            <li>
              <NavLink className="nav-link" to="/client" end>
                <CalendarDays />
                Appointments
              </NavLink>
            </li>
            <li>
              <NavLink className="nav-link" to="/client/book">
                <CalendarPlus />
                Book
              </NavLink>
            </li>
          </ul>
        </nav>

        <main className="shell-main" id="main" ref={mainRef} tabIndex={-1}>
          {viewer.kind === 'unknown' ? (
            <div className="shell-status" role="alert">
              <p className="error">Could not confirm who is logged in.</p>
              <button type="button" className="button small" onClick={logOut}>
                Log out
              </button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </LucideProvider>
  );
}
