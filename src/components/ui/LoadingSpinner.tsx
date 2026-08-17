export interface LoadingSpinnerProps {
  readonly message?: string;
  readonly className?: string;
}

/**
 * Component Loading Spinner hiển thị khi tải trang hoặc chờ dữ liệu.
 */
export function LoadingSpinner({
  message = 'Đang tải...',
  className = 'min-h-[50vh]',
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-900 dark:border-t-primary-400" />
      {message ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{message}</p>
      ) : null}
    </div>
  );
}

export default LoadingSpinner;
