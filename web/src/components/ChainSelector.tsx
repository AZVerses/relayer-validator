import { Select } from 'antd'
import { useChainStore } from '../stores/chain'

export function ChainSelector() {
  const { chains, selectedChainId, selectChain } = useChainStore()

  return (
    <Select
      value={selectedChainId}
      onChange={selectChain}
      variant="borderless"
      style={{ minWidth: 180 }}
      options={chains.map((c) => ({
        value: c.chainId,
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                flexShrink: 0,
              }}
            />
            {c.name}
          </span>
        ),
      }))}
    />
  )
}
