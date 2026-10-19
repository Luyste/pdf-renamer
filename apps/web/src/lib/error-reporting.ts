import { toast } from 'sonner';
import { reportClientLog } from './api';
import { ApiError } from './http';
import { translateOutsideReact } from './i18n';

/** Catches anything that escapes normal handling (uncaught throws,
 * unhandled promise rejections — most commonly a mutation call nobody
 * wrapped in try/catch) and: logs it server-side via /api/client-log so
 * it lands in the same Workers Logs stream as the worker/container
 * output, and toasts the user a reference id if the failure was an API
 * call, so they have something concrete to report back. */
export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    reportClientLog('error', event.message, {
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const requestId = reason instanceof ApiError ? reason.requestId : undefined;

    reportClientLog('error', message, { requestId });

    // Toast every failure, not only ApiErrors: a ZIP stream cut off
    // mid-download or a fetch blocked by an expired Access session rejects
    // with a plain TypeError, and used to fail with no feedback at all.
    toast.error(
      translateOutsideReact('toastUnexpectedError', {
        ref: requestId ? requestId.slice(0, 8) : '-',
      }),
    );
  });
}
