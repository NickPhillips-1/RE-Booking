import '@fontsource-variable/inter';
import '../dashboard.css';
import { LucideProvider } from 'lucide-react';
import { useRef, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { logOut } from '../auth';
import { useViewer } from '../viewer';
import { AccountMenu } from './AccountMenu';

type Brand = { name: string; to: string };

type SoloShellProps = {
  brand: Brand | null;
  children: ReactNode;
};

export function SoloShell({ brand, children }: SoloShellProps) {
  const viewer = useViewer();
  const mainRef = useRef<HTMLElement>(null);

  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  const account =
    viewer.kind === 'guest-account' ? (
      <AccountMenu
        name={viewer.guest.name}
        email={viewer.guest.email}
        role="Guest"
        onLogOut={logOut}
      />
    ) : viewer.kind === 'realtor' ? (
      <AccountMenu
        name={viewer.agent.name}
        email={viewer.agent.email}
        role="Realtor"
        onLogOut={logOut}
      />
    ) : viewer.kind === 'unknown' ? (
      <button type="button" className="button small" onClick={logOut}>
        Log out
      </button>
    ) : viewer.kind === 'guest' ? (
      <Link className="button small" to="/login?as=guest">
        Log in
      </Link>
    ) : null;

  return (
    <LucideProvider size={16} strokeWidth={1.75}>
      <div className="shell is-solo">
        <a className="skip-link" href="#main" onClick={skipToContent}>
          Skip to content
        </a>
        <header className="shell-topbar">
          {brand ? (
            <Link className="shell-brand" to={brand.to}>
              <span className="shell-brand-mark" aria-hidden="true">
                {[...brand.name.trim()][0]?.toUpperCase()}
              </span>
              <span className="shell-brand-name">{brand.name}</span>
            </Link>
          ) : (
            <span className="shell-brand" aria-hidden="true">
              <span className="skeleton skeleton-mark" />
              <span className="skeleton skeleton-brand" />
            </span>
          )}
          {account}
        </header>
        <main className="shell-main" id="main" ref={mainRef} tabIndex={-1}>
          {children}
        </main>
      </div>
    </LucideProvider>
  );
}
