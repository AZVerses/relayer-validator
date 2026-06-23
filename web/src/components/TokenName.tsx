import { LoadingOutlined } from '@ant-design/icons'
import { useTokenMetaMap } from '../hooks/useTokenMeta'
import { isNativeToken } from '../utils/format'

interface Props {
  address: string
  showSymbol?: boolean
}

export function TokenName({ address, showSymbol = false }: Props) {
  const { data: metaMap, isLoading } = useTokenMetaMap()

  if (isNativeToken(address)) {
    return (
      <span>
        <span style={{ fontWeight: 500, color: '#e2e8f0' }}>ETH</span>
        {showSymbol && <span style={{ color: '#5c6a82', marginLeft: 6, fontSize: 12 }}>ETH</span>}
      </span>
    )
  }

  const meta = metaMap?.get(address.toLowerCase())

  if (isLoading) return <LoadingOutlined style={{ color: '#5c6a82', fontSize: 12 }} />
  if (!meta) return null

  if (showSymbol) {
    return (
      <span>
        <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{meta.name}</span>
        <span style={{ color: '#5c6a82', marginLeft: 6, fontSize: 12 }}>{meta.symbol}</span>
      </span>
    )
  }

  return <span style={{ fontWeight: 500, fontSize: 12 }}>{meta.name}</span>
}
