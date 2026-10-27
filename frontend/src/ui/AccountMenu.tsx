import { ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type AccountMenuProps = {
  name: string;
  email: string;
  role: string;
  onLogOut: () => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0].toUpperCase())
    .join('');
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

export function AccountMenu({ name, email, role, onLogOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLastOnOpen = useRef(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (focusLastOnOpen.current ? items.at(-1) : items[0])?.focus();

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  function openMenu(focusLast: boolean) {
    focusLastOnOpen.current = focusLast;
    setOpen(true);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openMenu(event.key === 'ArrowUp');
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(menuRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(items.length - 1);
        break;
      case 'Escape':
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu(false))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="account-id">
          <span className="account-kicker">Logged in as {role.toLowerCase()}</span>
          <span className="account-name">{name}</span>
        </span>
        <ChevronDown className="account-chevron" />
      </button>

      {open && (
        <div className="account-popover" onKeyDown={onMenuKeyDown}>
          <div className="account-identity">
            <p className="account-identity-kicker">Logged in as {role.toLowerCase()}</p>
            <p className="account-identity-name">{name}</p>
            <p className="account-identity-email">{email}</p>
          </div>
          <div ref={menuRef} id={menuId} role="menu" aria-label="Account">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="menu-item"
              onClick={onLogOut}
            >
              <LogOut />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
