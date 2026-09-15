import { AlertIcon } from "./icons";

/**
 * Replaces the hand-rolled `.banner.banner-error` blocks copy-pasted across pages. Never
 * shows a raw API error — `message` is always the already-friendly string the caller
 * produced (see `Home.tsx`'s own `ApiError` handling for that translation).
 */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <AlertIcon aria-hidden="true" />
      <div className="error-banner-row">
        <span>{message}</span>
        {onRetry && (
          <button type="button" className="error-banner-retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
