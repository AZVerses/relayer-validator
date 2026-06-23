import { Tag } from 'antd'

const statusConfig: Record<string, { color: string; label: string }> = {
  confirmed: { color: '#22c55e', label: 'confirmed' },
  confirming: { color: '#3b82f6', label: 'confirming' },
  unconfirmed: { color: '#5c6a82', label: 'unconfirmed' },
  pending: { color: '#f59e0b', label: 'pending' },
  paused: { color: '#ef4444', label: 'paused' },
  executed: { color: '#06b6d4', label: 'executed' },
}

// Some APIs return numeric status codes
const numericMap: Record<number, string> = {
  0: 'unconfirmed',
  1: 'confirming',
  2: 'confirmed',
}

interface Props {
  status: string | number
}

export function StatusTag({ status }: Props) {
  const resolved = typeof status === 'number' ? (numericMap[status] ?? String(status)) : status
  const key = resolved.toLowerCase()
  const cfg = statusConfig[key]
  return (
    <Tag
      color={cfg?.color ?? '#5c6a82'}
      style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0 }}
    >
      {cfg?.label ?? resolved}
    </Tag>
  )
}
