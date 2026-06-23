import { useState } from 'react'
import { Select, DatePicker, Modal, Button, Space } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const CUSTOM = -1

const presets = [
  { label: 'Last 1 hour', value: 3600 },
  { label: 'Last 4 hours', value: 14400 },
  { label: 'Last 1 day', value: 86400 },
  { label: 'Last 7 days', value: 604800 },
  { label: 'Last 2 weeks', value: 1209600 },
  { label: 'Last 30 days', value: 2592000 },
  { label: 'Custom range...', value: CUSTOM },
]

export interface TimeRangeValue {
  startTimestamp: number
  endTimestamp: number
  label?: string
}

interface Props {
  value?: TimeRangeValue
  onChange?: (value: TimeRangeValue | undefined) => void
  style?: React.CSSProperties
}

export function TimeRangeFilter({ value, onChange, style }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

  // Derive select display value from the current value
  const selectDisplay = (() => {
    if (!value) return undefined
    if (value.label === 'custom') return CUSTOM
    // Check if value matches a preset.
    const diff = value.endTimestamp - value.startTimestamp
    const matched = presets.find((p) => p.value > 0 && Math.abs(p.value - diff) < 60)
    return matched?.value
  })()

  const handleSelect = (v: number | undefined) => {
    if (v === undefined || v === null) {
      onChange?.(undefined)
      return
    }
    if (v === CUSTOM) {
      setModalOpen(true)
      return
    }
    const now = Math.floor(Date.now() / 1000)
    onChange?.({ startTimestamp: now - v, endTimestamp: now })
  }

  const handleCustomApply = () => {
    if (customRange?.[0] && customRange?.[1]) {
      onChange?.({
        startTimestamp: customRange[0].unix(),
        endTimestamp: customRange[1].unix(),
        label: 'custom',
      })
    }
    setModalOpen(false)
  }

  return (
    <>
      <Select
        value={selectDisplay}
        onChange={handleSelect}
        placeholder={value?.label === 'custom' ? `${dayjs.unix(value.startTimestamp).format('MM/DD HH:mm')} - ${dayjs.unix(value.endTimestamp).format('MM/DD HH:mm')}` : 'Time range'}
        allowClear
        onClear={() => onChange?.(undefined)}
        style={{ width: 200, ...style }}
        options={presets}
      />
      <Modal
        title="Custom Time Range"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={handleCustomApply} disabled={!customRange?.[0] || !customRange?.[1]}>
              Apply
            </Button>
          </Space>
        }
        width={420}
      >
        <div style={{ padding: '16px 0' }}>
          <RangePicker
            showTime
            value={customRange}
            onChange={(dates) => setCustomRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            style={{ width: '100%' }}
          />
        </div>
      </Modal>
    </>
  )
}
