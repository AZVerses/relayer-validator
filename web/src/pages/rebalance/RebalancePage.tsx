import { useState } from 'react'
import {
  Card, Table, Form, Input, Button, Space, Alert, Descriptions, Tag, Select,
  Popconfirm, message, Typography,
} from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import {
  fetchActiveCollection,
  fetchCollections,
  createRebalanceCollection,
  collectSignature,
  rejectCollection,
} from '../../api/admin/rebalance'
import { fetchLocalValidator } from '../../api/local/validator'
import { getValidatorServiceBase } from '../../config/chains'
import { useChainStore } from '../../stores/chain'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { useVaultBasics } from '../../hooks/useVaultInfo'
import { AddressLink } from '../../components/AddressLink'
import { TokenSelect } from '../../components/TokenSelect'
import { TokenName } from '../../components/TokenName'
import { formatTokenAmount, isNativeToken, isZeroAddress } from '../../utils/format'
import type { SignatureCollection, CollectionValidator, CollectionStatus, CollectionFilters } from '../../types/rebalance'

const statusColors: Record<CollectionStatus, string> = {
  collecting: '#f59e0b',
  executing: '#3b82f6',
  executed: '#22c55e',
  rejected: '#ef4444',
  failed: '#ef4444',
}

function getRebalanceReceiver(receiver: string | undefined): string {
  if (!receiver) {
    throw new Error('rebalance receiver is still loading')
  }
  if (isZeroAddress(receiver)) {
    throw new Error('rebalance receiver is not set on the vault')
  }
  return receiver
}

function StatusBadge({ status }: { status: CollectionStatus }) {
  return (
    <Tag color={statusColors[status]} style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {status}
    </Tag>
  )
}

function VoteIcon({ decision }: { decision: CollectionValidator['decision'] }) {
  if (decision === 'signed') return <CheckCircleFilled style={{ color: '#22c55e', fontSize: 14 }} />
  if (decision === 'rejected') return <CloseCircleFilled style={{ color: '#ef4444', fontSize: 14 }} />
  return <ClockCircleOutlined style={{ color: '#5c6a82', fontSize: 14 }} />
}

function PowerBar({ collected, required }: { collected: string; required: string }) {
  const c = Number(collected)
  const r = Number(required)
  const pct = r > 0 ? Math.min((c / r) * 100, 100) : 0
  const color = pct >= 100 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#5c6a82'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
        {collected} / {required}
      </span>
    </div>
  )
}

function ActiveCollection({ collection, chainId }: { collection: SignatureCollection; chainId: number }) {
  const queryClient = useQueryClient()
  const { data: localValidator } = useQuery({
    queryKey: ['localValidator', chainId],
    queryFn: () => fetchLocalValidator(getValidatorServiceBase()),
    staleTime: Infinity,
    retry: false,
  })
  const { data: metaMap } = useTokenMetaMap()

  const getMeta = (addr: string) => {
    if (isNativeToken(addr)) return { address: addr, name: 'ETH', symbol: 'ETH', decimals: 18 }
    return metaMap?.get(addr.toLowerCase())
  }

  const meta = getMeta(collection.payload.tokenAddress)
  const myVote = collection.validators.find(
    (v) => v.validatorAddress.toLowerCase() === localValidator?.validatorAddress.toLowerCase(),
  )
  const canAct = collection.status === 'collecting' && myVote && myVote.decision === null

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['activeCollection', chainId] })
    queryClient.invalidateQueries({ queryKey: ['collections', chainId] })
  }

  const signMut = useMutation({
    mutationFn: () => collectSignature(collection.id, collection.payload),
    onSuccess: () => { message.success('Signature submitted'); invalidate() },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed to sign'),
  })

  const rejectMut = useMutation({
    mutationFn: () => rejectCollection(collection.id, collection.payload),
    onSuccess: () => { message.success('Collection rejected'); invalidate() },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed to reject'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {collection.status === 'collecting' && (
        <Alert
          type="warning"
          showIcon
          message="Rebalance collection in progress"
          description="A rebalance withdraw is awaiting validator signatures. Please review and approve or reject."
        />
      )}

      <Card
        title={<Space><StatusBadge status={collection.status} /><span>Rebalance #{collection.id}</span></Space>}
        extra={
          canAct && (
            <Space>
              <Popconfirm title="Approve and sign this rebalance?" onConfirm={() => signMut.mutate()}>
                <Button type="primary" icon={<SendOutlined />} loading={signMut.isPending}>
                  Approve & Sign
                </Button>
              </Popconfirm>
              <Popconfirm title="Reject this rebalance? This will cancel the collection." onConfirm={() => rejectMut.mutate()}>
                <Button danger icon={<StopOutlined />} loading={rejectMut.isPending}>
                  Reject
                </Button>
              </Popconfirm>
            </Space>
          )
        }
        size="small"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Descriptions column={2} size="small" labelStyle={{ color: '#5c6a82' }} contentStyle={{ color: '#e2e8f0' }}>
            <Descriptions.Item label="Token">
              <Space size={6}>
                <TokenName address={collection.payload.tokenAddress} showSymbol />
                <AddressLink address={collection.payload.tokenAddress} />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Amount">
              <span style={{ fontWeight: 500 }}>
                {formatTokenAmount(collection.payload.amount, meta)}
                {meta?.symbol && <span style={{ color: '#5c6a82', marginLeft: 4, fontSize: 12 }}>{meta.symbol}</span>}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Receiver">
              <AddressLink address={collection.payload.receiver} />
            </Descriptions.Item>
            {collection.executeTxHash && (
              <Descriptions.Item label="Tx Hash">
                <AddressLink address={collection.executeTxHash} type="tx" />
              </Descriptions.Item>
            )}
            {collection.failureMessage && (
              <Descriptions.Item label="Error" span={2}>
                <Typography.Text type="danger">{collection.failureMessage}</Typography.Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          <div>
            <div style={{ fontSize: 12, color: '#5c6a82', marginBottom: 6 }}>
              Power: {collection.respondedValidatorCount} / {collection.totalValidatorCount} validators responded
            </div>
            <PowerBar collected={collection.collectedPower} required={collection.requiredPower} />
          </div>

          <Table<CollectionValidator>
            columns={[
              {
                title: 'Validator',
                dataIndex: 'validatorAddress',
                key: 'validatorAddress',
                render: (addr: string) => <AddressLink address={addr} />,
              },
              {
                title: 'Power',
                dataIndex: 'validatorPower',
                key: 'validatorPower',
                width: 80,
                render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
              },
              {
                title: 'Decision',
                dataIndex: 'decision',
                key: 'decision',
                width: 100,
                render: (d: CollectionValidator['decision']) => (
                  <Space size={6}>
                    <VoteIcon decision={d} />
                    <span style={{ color: d === 'signed' ? '#22c55e' : d === 'rejected' ? '#ef4444' : '#5c6a82', fontSize: 12 }}>
                      {d ?? 'pending'}
                    </span>
                  </Space>
                ),
              },
              {
                title: 'Submitted',
                dataIndex: 'submittedAt',
                key: 'submittedAt',
                width: 170,
                render: (v: string | null) =>
                  v ? <span style={{ color: '#8b95a8', fontSize: 12 }}>{new Date(v).toLocaleString()}</span> : null,
              },
            ]}
            dataSource={collection.validators}
            rowKey="validatorAddress"
            pagination={false}
            size="small"
          />
        </div>
      </Card>
    </div>
  )
}

export function RebalancePage() {
  const chainId = useChainStore((s) => s.selectedChainId)
  const { data: metaMap } = useTokenMetaMap()
  const {
    data: vaultBasics,
    error: vaultBasicsError,
    isError: isVaultBasicsError,
    isLoading: isVaultBasicsLoading,
    refetch: refetchVaultBasics,
  } = useVaultBasics()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [historyFilters, setHistoryFilters] = useState<CollectionFilters>({ page: 1, pageSize: 10 })
  const rebalanceReceiver = vaultBasics?.rebalanceReceiver
  const receiverReady = !!rebalanceReceiver && !isZeroAddress(rebalanceReceiver)

  const { data: active, isLoading: activeLoading } = useQuery({
    queryKey: ['activeCollection', chainId],
    queryFn: () => fetchActiveCollection(chainId),
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'collecting' ? 15_000 : false
    },
  })

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['collections', chainId, historyFilters],
    queryFn: () => fetchCollections(chainId, historyFilters),
  })

  const getMeta = (addr: string) => {
    if (isNativeToken(addr)) return { address: addr, name: 'ETH', symbol: 'ETH', decimals: 18 }
    return metaMap?.get(addr.toLowerCase())
  }

  const createMut = useMutation({
    mutationFn: (values: { tokenAddress: string; amount: string }) => {
      const receiver = getRebalanceReceiver(rebalanceReceiver)
      const meta = getMeta(values.tokenAddress)
      const decimals = meta?.decimals ?? 18
      const amountBaseUnits = parseUnits(values.amount, decimals).toString()
      return createRebalanceCollection(chainId, {
        tokenAddress: values.tokenAddress,
        amount: amountBaseUnits,
        receiver,
      })
    },
    onSuccess: () => {
      message.success('Rebalance collection initiated')
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['activeCollection', chainId] })
      queryClient.invalidateQueries({ queryKey: ['collections', chainId] })
    },
    onError: (e) => message.error(e instanceof Error ? e.message : 'Failed to initiate'),
  })

  const historyColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: 'Token',
      key: 'token',
      width: 150,
      render: (_: unknown, r: SignatureCollection) => (
        <div style={{ lineHeight: 1.6 }}>
          <TokenName address={r.payload.tokenAddress} />
          <div><AddressLink address={r.payload.tokenAddress} /></div>
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 140,
      render: (_: unknown, r: SignatureCollection) => {
        const meta = getMeta(r.payload.tokenAddress)
        return (
          <span style={{ fontWeight: 500 }}>
            {formatTokenAmount(r.payload.amount, meta)}
            {meta?.symbol && <span style={{ color: '#5c6a82', marginLeft: 4, fontSize: 12 }}>{meta.symbol}</span>}
          </span>
        )
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: CollectionStatus) => <StatusBadge status={s} />,
    },
    {
      title: 'Power',
      key: 'power',
      width: 120,
      render: (_: unknown, r: SignatureCollection) => (
        <span style={{ fontSize: 12, color: '#8b95a8' }}>
          {r.collectedPower} / {r.requiredPower}
        </span>
      ),
    },
    {
      title: 'Tx Hash',
      dataIndex: 'executeTxHash',
      key: 'executeTxHash',
      width: 120,
      render: (hash: string | null) => hash ? <AddressLink address={hash} type="tx" /> : <span style={{ color: '#5c6a82' }}>-</span>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Rebalance</div>

      {/* Active collection or initiate form */}
      {activeLoading ? (
        <Card loading />
      ) : active ? (
        <ActiveCollection collection={active} chainId={chainId} />
      ) : (
        <Card title="Initiate Rebalance Withdraw" size="small">
          {isVaultBasicsLoading && (
            <Alert
              type="info"
              showIcon
              message="Loading rebalance receiver from the vault"
              style={{ marginBottom: 16 }}
            />
          )}
          {isVaultBasicsError && (
            <Alert
              type="error"
              showIcon
              message="Failed to load rebalance receiver"
              description={vaultBasicsError instanceof Error ? vaultBasicsError.message : 'Check the RPC proxy and vault configuration.'}
              action={<Button size="small" onClick={() => refetchVaultBasics()}>Retry</Button>}
              style={{ marginBottom: 16 }}
            />
          )}
          {!isVaultBasicsLoading && !isVaultBasicsError && rebalanceReceiver && isZeroAddress(rebalanceReceiver) && (
            <Alert
              type="warning"
              showIcon
              message="Rebalance receiver is not set on the vault"
              style={{ marginBottom: 16 }}
            />
          )}
          {receiverReady && (
            <Alert
              type="success"
              showIcon
              message={<Space size={6}>Receiver <AddressLink address={rebalanceReceiver} /></Space>}
              style={{ marginBottom: 16 }}
            />
          )}
          <Form
            form={form}
            layout="inline"
            onFinish={(v) => createMut.mutate(v)}
            style={{ gap: 8, flexWrap: 'wrap' }}
          >
            <Form.Item name="tokenAddress" rules={[{ required: true, message: 'Select a token' }]}>
              <TokenSelect placeholder="Token" />
            </Form.Item>
            <Form.Item name="amount" rules={[{ required: true, message: 'Enter amount' }]}>
              <Input placeholder="Amount" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={createMut.isPending}
                disabled={!receiverReady}
              >
                Initiate
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* History */}
      <Card
        title="History"
        size="small"
        extra={
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 140 }}
            onChange={(v) => setHistoryFilters((f) => {
              const next: CollectionFilters = { page: 1, pageSize: f.pageSize }
              if (v) next.status = v
              return next
            })}
            options={[
              { label: 'Collecting', value: 'collecting' },
              { label: 'Executing', value: 'executing' },
              { label: 'Executed', value: 'executed' },
              { label: 'Rejected', value: 'rejected' },
              { label: 'Failed', value: 'failed' },
            ]}
          />
        }
      >
        <Table<SignatureCollection>
          columns={historyColumns}
          dataSource={history?.items}
          rowKey="id"
          loading={historyLoading}
          size="small"
          expandable={{
            expandedRowRender: (record) => (
              <Table<CollectionValidator>
                columns={[
                  { title: 'Validator', dataIndex: 'validatorAddress', key: 'addr', render: (a: string) => <AddressLink address={a} /> },
                  { title: 'Power', dataIndex: 'validatorPower', key: 'power', width: 80 },
                  { title: 'Decision', dataIndex: 'decision', key: 'decision', width: 100, render: (d: CollectionValidator['decision']) => <Space size={6}><VoteIcon decision={d} /><span style={{ fontSize: 12 }}>{d ?? 'pending'}</span></Space> },
                  { title: 'Submitted', dataIndex: 'submittedAt', key: 'time', width: 170, render: (v: string | null) => v ? <span style={{ fontSize: 12, color: '#8b95a8' }}>{new Date(v).toLocaleString()}</span> : null },
                ]}
                dataSource={record.validators}
                rowKey="validatorAddress"
                pagination={false}
                size="small"
              />
            ),
          }}
          pagination={{
            current: history?.page ?? 1,
            pageSize: history?.pageSize ?? 10,
            total: history?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => <span style={{ color: '#5c6a82' }}>{total} records</span>,
            onChange: (page, pageSize) => setHistoryFilters((f) => ({ ...f, page, pageSize })),
          }}
        />
      </Card>
    </div>
  )
}
