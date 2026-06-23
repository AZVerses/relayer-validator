import { Tag, Tooltip } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useChainStore } from '../stores/chain'
import { getValidatorServiceBase } from '../config/chains'
import { fetchLocalValidator } from '../api/local/validator'
import { shortenAddress } from '../utils/format'

export function ValidatorBadge() {
  const chainId = useChainStore((s) => s.selectedChainId)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['localValidator', chainId],
    queryFn: () => fetchLocalValidator(getValidatorServiceBase(chainId)),
    staleTime: Infinity,
    retry: false,
  })

  if (isLoading) {
    return <Tag style={{ margin: 0, fontSize: 11 }}>Resolving validator…</Tag>
  }
  if (isError || !data) {
    return <Tag color="error" style={{ margin: 0, fontSize: 11 }}>Validator service unreachable</Tag>
  }

  return (
    <Tooltip title={data.validatorAddress}>
      <Tag
        color="#3b82f6"
        style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        Validator {shortenAddress(data.validatorAddress)}
      </Tag>
    </Tooltip>
  )
}
