import { Select } from 'antd'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { useTokens } from '../hooks/useGraphData'
import { shortenAddress } from '../utils/format'

interface Props {
  value?: string
  onChange?: (value: string | undefined) => void
  placeholder?: string
  allowClear?: boolean
  style?: React.CSSProperties
}

export function TokenSelect({ value, onChange, placeholder = 'All tokens', allowClear = true, style }: Props) {
  const { data: tokens } = useTokens()
  const { data: metaMap } = useTokenMetaMap()

  const options = (tokens ?? []).map((t) => {
    const addr = t.token.toLowerCase()
    const meta = metaMap?.get(addr)
    const label = meta
      ? `${meta.name} (${meta.symbol})`
      : shortenAddress(t.token)
    return { value: t.token, label }
  })

  return (
    <Select
      value={value}
      onChange={(v) => onChange?.(v || undefined)}
      placeholder={placeholder}
      allowClear={allowClear}
      style={{ width: 220, ...style }}
      options={options}
      showSearch
      filterOption={(input, option) =>
        (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
      }
    />
  )
}
