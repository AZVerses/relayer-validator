import { useChainStore } from '../stores/chain'
import { shortenAddress } from '../utils/format'

interface Props {
  address: string
  type?: 'address' | 'tx'
}

export function AddressLink({ address, type = 'address' }: Props) {
  const chain = useChainStore((s) => s.getCurrentChain())
  const path = type === 'tx' ? 'tx' : 'address'
  const href = `${chain.explorerUrl}/${path}/${address}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      style={{
        color: '#60a5fa',
        fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', monospace",
        fontSize: 12,
        textDecoration: 'none',
      }}
    >
      {shortenAddress(address)}
    </a>
  )
}
