export function BootLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="flex min-h-svh items-center justify-center px-6"
    >
      <span className="boot-loader__wordmark">patram</span>
    </div>
  );
}
