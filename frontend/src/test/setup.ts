import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Settings } from 'luxon';
import { afterEach, vi } from 'vitest';
import { logOut } from '../auth';

Settings.defaultLocale = 'en-US';

const probe = document.createElement('dialog');
document.body.append(probe);
try {
  probe.showModal();
  probe.close();
} catch {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
probe.remove();

afterEach(() => {
  cleanup();
  logOut();
  vi.useRealTimers();
});
