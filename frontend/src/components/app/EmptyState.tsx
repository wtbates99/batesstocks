/**
 * EmptyState — terminal-native empty/no-data display.
 */
interface EmptyStateProps {
  title?: string
  message: string
  className?: string
}

export default function EmptyState({
  title = 'NO DATA',
  message,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-block ${className}`}>
      <div className="empty-title">{title}</div>
      <div className="empty-copy">{message}</div>
    </div>
  )
}
