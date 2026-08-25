import { useMemo, useState } from 'react'
import { Card, Row, Col, Table, Statistic, Space, Button, Tag, Descriptions, message, Popconfirm, Spin } from 'antd'
import { SafetyOutlined, ReloadOutlined, LockOutlined } from '@ant-design/icons'
import { useTokens, useValidators } from '../../hooks/useGraphData'
import { useTokenMetaMap, type TokenMeta } from '../../hooks/useTokenMeta'
import { useVaultInfo, useRequiredPower } from '../../hooks/useVaultInfo'
import { AddressLink } from '../../components/AddressLink'
import { TokenName } from '../../components/TokenName'
import { resetHotAmount } from '../../api/admin/withdrawals'
import { useChainStore } from '../../stores/chain'
import { formatTokenAmount, calcHardCap, calcRefillRate, shortenAddress, formatDuration, isNativeToken, isZeroAddress } from '../../utils/format'
import type { GraphToken, GraphValidator } from '../../api/graph/queries'

function FastLaneBar({ used, hardCap, meta }: { used: string; hardCap: bigint; meta: TokenMeta | undefined }) {
  const usedBig = BigInt(used)
  const remaining = hardCap > usedBig ? hardCap - usedBig : 0n
  const pct = hardCap > 0n ? Number(remaining * 10000n / hardCap) / 100 : 100

  const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444'
  const bgColor = pct > 50 ? 'rgba(34,197,94,0.1)' : pct > 20 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
      <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
        {formatTokenAmount(remaining, meta)}
        {meta?.symbol && <span style={{ color: '#5c6a82', marginLeft: 3, fontSize: 11 }}>{meta.symbol}</span>}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: bgColor,
          overflow: 'hidden',
          minWidth: 60,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: barColor,
            transition: 'width 0.3s',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: '#5c6a82', whiteSpace: 'nowrap' }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function ValidatorSetCard({ set, validatorColumns }: {
  set: { hash: string; index: number; members: GraphValidator[]; totalPower: number; requiredPower?: string }
  validatorColumns: object[]
}) {
  const { data: requiredPower, isLoading } = useRequiredPower(set.hash, set.requiredPower)

  return (
    <Card
      key={set.hash}
      title={
        <span style={{ fontSize: 13 }}>
          Validator Set #{set.index}
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#5c6a82', marginLeft: 8 }}>
            {shortenAddress(set.hash, 8)}
          </span>
        </span>
      }
      extra={
        <Space size={16}>
          <span style={{ color: '#8b95a8', fontSize: 12 }}>
            Required Power: {isLoading ? <Spin size="small" /> : <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{requiredPower ?? '?'}</span>}
          </span>
          <span style={{ color: '#8b95a8', fontSize: 12 }}>
            Total Power: <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{set.totalPower}</span>
          </span>
        </Space>
      }
      size="small"
    >
      <Table<GraphValidator>
        columns={validatorColumns as Parameters<typeof Table<GraphValidator>>[0]['columns']}
        dataSource={set.members}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </Card>
  )
}

export function OverviewPage() {
  const chainId = useChainStore((s) => s.selectedChainId)
  const chain = useChainStore((s) => s.getCurrentChain())
  const { data: tokens, isLoading: tokensLoading, refetch: refetchTokens } = useTokens()
  const { data: validators, isLoading: validatorsLoading } = useValidators()
  const { data: metaMap } = useTokenMetaMap()
  const { data: vaultInfo, isLoading: vaultLoading } = useVaultInfo()
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([])
  const [resetting, setResetting] = useState(false)

  const getMeta = (tokenAddr: string) => {
    if (isNativeToken(tokenAddr)) return { address: tokenAddr, name: 'ETH', symbol: 'ETH', decimals: 18 }
    return metaMap?.get(tokenAddr.toLowerCase())
  }

  const validatorSets = useMemo(() => {
    if (!validators?.length) return []
    const grouped = new Map<string, GraphValidator[]>()
    for (const v of validators) {
      const list = grouped.get(v.validatorSetHash) ?? []
      list.push(v)
      grouped.set(v.validatorSetHash, list)
    }
    return Array.from(grouped.entries()).map(([hash, members], idx) => ({
      hash,
      index: idx + 1,
      members,
      totalPower: members.reduce((sum, v) => sum + Number(v.power), 0),
      requiredPower: members[0]?.requiredPower,
    }))
  }, [validators])

  const handleResetSelected = async () => {
    const addresses = selectedTokenKeys.map((key) => {
      const token = tokens?.find((t) => t.id === key)
      return token?.token ?? key
    })
    setResetting(true)
    try {
      await resetHotAmount(chainId, addresses)
      message.success('Reset hot amount submitted')
      refetchTokens()
      setSelectedTokenKeys([])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to reset hot amount')
    } finally {
      setResetting(false)
    }
  }

  const handleResetAll = async () => {
    if (!tokens?.length) return
    setResetting(true)
    try {
      await resetHotAmount(chainId, tokens.map((t) => t.token))
      message.success('Reset all hot amounts submitted')
      refetchTokens()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to reset hot amounts')
    } finally {
      setResetting(false)
    }
  }

  const tokenColumns = [
    {
      title: 'Token',
      dataIndex: 'token',
      key: 'token',
      width: 200,
      render: (addr: string) => (
        <div>
          <TokenName address={addr} showSymbol />
          <div><AddressLink address={addr} /></div>
        </div>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      width: 150,
      render: (val: string, record: GraphToken) => {
        const meta = getMeta(record.token)
        return (
          <span style={{ fontWeight: 500 }}>
            {formatTokenAmount(val, meta)}
            {meta?.symbol && <span style={{ color: '#5c6a82', marginLeft: 4, fontSize: 12 }}>{meta.symbol}</span>}
          </span>
        )
      },
    },
    {
      title: 'Hard Cap',
      key: 'hardCap',
      width: 180,
      render: (_: unknown, record: GraphToken) => {
        const meta = getMeta(record.token)
        const hardCap = calcHardCap(record.balance, record.hardCapRatioBps)
        return (
          <span style={{ color: '#8b95a8' }}>
            {formatTokenAmount(hardCap, meta)}
            {meta?.symbol && <span style={{ fontSize: 12, marginLeft: 4 }}>{meta.symbol}</span>}
            <span style={{ fontSize: 11, color: '#5c6a82', marginLeft: 4 }}>({record.hardCapRatioBps} bps)</span>
          </span>
        )
      },
    },
    {
      title: 'Refill Rate /s',
      key: 'refillRate',
      width: 140,
      render: (_: unknown, record: GraphToken) => {
        const meta = getMeta(record.token)
        const hardCap = calcHardCap(record.balance, record.hardCapRatioBps)
        const refillPerSec = calcRefillRate(hardCap, record.refillRateMps)
        return (
          <span style={{ color: '#8b95a8' }}>
            {formatTokenAmount(refillPerSec, meta)}
            {meta?.symbol && <span style={{ fontSize: 12, marginLeft: 4 }}>{meta.symbol}</span>}
          </span>
        )
      },
    },
    {
      title: 'Fast Lane',
      key: 'fastLane',
      width: 280,
      render: (_: unknown, record: GraphToken) => {
        const meta = getMeta(record.token)
        const hardCap = calcHardCap(record.balance, record.hardCapRatioBps)
        return <FastLaneBar used={record.usedWithdrawHotAmount} hardCap={hardCap} meta={meta} />
      },
    },
    {
      title: 'Last Refill',
      dataIndex: 'lastRefillTimestamp',
      key: 'lastRefillTimestamp',
      width: 160,
      render: (val: string) => {
        const ts = Number(val)
        return ts > 0 ? (
          <span style={{ color: '#8b95a8', fontSize: 12 }}>{new Date(ts * 1000).toLocaleString()}</span>
        ) : (
          <span style={{ color: '#5c6a82' }}>-</span>
        )
      },
    },
  ]

  const validatorColumns = [
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      render: (addr: string) => <AddressLink address={addr} />,
    },
    {
      title: 'Power',
      dataIndex: 'power',
      key: 'power',
      render: (val: string) => <span style={{ fontWeight: 500 }}>{val}</span>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Overview</div>

      {/* Contract Info */}
      <Card title="Contract Info" size="small" loading={vaultLoading}>
        <Descriptions column={2} size="small" labelStyle={{ color: '#5c6a82' }} contentStyle={{ color: '#e2e8f0' }}>
          <Descriptions.Item label="Vault Address">
            <AddressLink address={chain.vaultAddress} />
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            {vaultInfo?.paused
              ? <Tag color="#ef4444">Paused</Tag>
              : <Tag color="#22c55e">Active</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Challenge Period">
            {vaultInfo ? formatDuration(vaultInfo.challengePeriod) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Rebalance Receiver">
            {vaultInfo?.rebalanceReceiver && !isZeroAddress(vaultInfo.rebalanceReceiver)
              ? <AddressLink address={vaultInfo.rebalanceReceiver} />
              : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Contract Roles */}
      <Card title={<><LockOutlined style={{ marginRight: 8 }} />Contract Roles</>} size="small" loading={vaultLoading}>
        <Row gutter={[16, 12]}>
          {vaultInfo?.roles.map((role) => (
            <Col span={12} key={role.name}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Tag style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>{role.name}</Tag>
                {role.holders.length > 0 ? (
                  <Space size={6} wrap>
                    {role.holders.map((addr) => <AddressLink key={addr} address={addr} />)}
                  </Space>
                ) : (
                  <span style={{ color: '#5c6a82', fontSize: 12 }}>No holders</span>
                )}
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Stats */}
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Supported Tokens" value={tokens?.length ?? 0} loading={tokensLoading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Active Validators"
              value={validators?.length ?? 0}
              prefix={<SafetyOutlined style={{ fontSize: 16, color: '#3b82f6' }} />}
              loading={validatorsLoading}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Validator Sets" value={validatorSets.length} loading={validatorsLoading} />
          </Card>
        </Col>
      </Row>

      {/* Token Assets */}
      <Card
        title="Token Assets"
        extra={
          <Space>
            {selectedTokenKeys.length > 0 && (
              <Popconfirm title={`Reset hot amount for ${selectedTokenKeys.length} token(s)?`} onConfirm={handleResetSelected}>
                <Button size="small" loading={resetting} icon={<ReloadOutlined />}>
                  Reset Hot Amount ({selectedTokenKeys.length})
                </Button>
              </Popconfirm>
            )}
            <Popconfirm title="Reset hot amount for ALL tokens?" onConfirm={handleResetAll}>
              <Button size="small" loading={resetting} icon={<ReloadOutlined />}>
                Reset All Hot Amount
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table<GraphToken>
          columns={tokenColumns}
          dataSource={tokens}
          rowKey="id"
          loading={tokensLoading}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          rowSelection={{
            selectedRowKeys: selectedTokenKeys,
            onChange: (keys) => setSelectedTokenKeys(keys as string[]),
          }}
        />
      </Card>

      {/* Validators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>Validators</div>
        {validatorsLoading && <Card loading />}
        {validatorSets.map((set) => (
          <ValidatorSetCard key={set.hash} set={set} validatorColumns={validatorColumns} />
        ))}
        {!validatorsLoading && validatorSets.length === 0 && (
          <Card><span style={{ color: '#5c6a82' }}>No validators found</span></Card>
        )}
      </div>
    </div>
  )
}
