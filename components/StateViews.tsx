"use client";
import Link from "next/link";

export interface EmptyStateProps {
  title?: string;
  message: string;
  action?: { label: string; href: string };
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center min-h-[320px] text-center gap-4">
      <p className="font-semibold">{message}</p>
      {action ? (
        <Link
          href={action.href}
          className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700"
        >
          + {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card" role="alert">
      <p className="text-danger font-semibold">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-primary-600 hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="card flex flex-col items-center justify-center min-h-[320px] text-center gap-4">
      <p>Loading…</p>
    </div>
  );
}
