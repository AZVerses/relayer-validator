import { useState, type CSSProperties } from 'react'
import { Card, Table, Input, Space, Button, Form, Select, message, Popconfirm, Tag } from 'antd'
import {
  SearchOutlined,
  ClearOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWithdrawals,
  pauseWithdrawal,
  unpauseWithdrawal,
  executeWithdrawal,
  flushWithdrawals,
} from '../../api/admin/withdrawals'
import { useChainStore } from '../../stores/chain'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { useVaultBasics } from '../../hooks/useVaultInfo'
import { AddressLink } from '../../components/AddressLink'
import { TokenName } from '../../components/TokenName'
import { TokenSelect } from '../../components/TokenSelect'
import { TimeRangeFilter, type TimeRangeValue } from '../../components/TimeRangeSelect'
import { formatDecimalAmount, formatUnixSeconds } from '../../utils/format'
import { deriveWithdrawalActionFlags } from '../../utils/withdrawal-actions'
import { runWithdrawalAction } from '../../utils/withdrawal-action-runner'
import type { Withdrawal, WithdrawalFilters } from '../../types/withdrawal'

function BoolIcon({ value }: { value: boolean }) {
  return value
    ? <CheckCircleFilled style={{ color: '#22c55e', fontSize: 14 }} />
    : <CloseCircleFilled style={{ color: '#3a4255', fontSize: 14 }} />
}

const actionButtonStyles = {
  flush: { background: '#2563eb', borderColor: '#2563eb', color: '#ffffff' },
  pause: { background: '#d97706', borderColor: '#d97706', color: '#ffffff' },
  unpause: { background: '#16a34a', borderColor: '#16a34a', color: '#ffffff' },
  execute: { background: '#7c3aed', borderColor: '#7c3aed', color: '#ffffff' },
} satisfies Record<string, CSSProperties>

function buildFilters(pageSize: number, values?: Record<string, unknown>): WithdrawalFilters {
  const f: WithdrawalFilters = { page: 1, pageSize }
  if (!values) return f
  const user = (values.user as string)?.trim()
  if (user) f.user = user
  const token = values.tokenAddress as string | undefined
  if (token) f.tokenAddress = token
  const tr = values.timeRange as TimeRangeValue | undefined
  if (tr?.startTimestamp) f.startTimestamp = tr.startTimestamp
  if (tr?.endTimestamp) f.endTimestamp = tr.endTimestamp
  const pending = values.isPending as string | null | undefined
  if (pending === 'true') f.isPending = true
  else if (pending === 'false') f.isPending = false
  const paused = values.isPaused as string | null | undefined
  if (paused === 'true') f.isPaused = true
  else if (paused === 'false') f.isPaused = false
  return f
}

export function WithdrawalsPage() {
  const chainId = useChainStore((s) => s.selectedChainId)
  const { data: metaMap } = useTokenMetaMap()
  const { data: vaultInfo } = useVaultBasics()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<WithdrawalFilters>({ page: 1, pageSize: 20 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set())
  const [form] = Form.useForm()

  const challengePeriod = vaultInfo?.challengePeriod
  const withdrawalQueryKey = ['withdrawals', chainId, filters] as const

  const { data, isLoading } = useQuery({
    queryKey: withdrawalQueryKey,
    queryFn: () => fetchWithdrawals(chainId, filters),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  const getMeta = (addr: string) => metaMap?.get(addr.toLowerCase())

  const markRowsLoading = (ids: string[]) => {
    setLoadingRows((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  const clearRowsLoading = (ids: string[]) => {
    setLoadingRows((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const refreshWithdrawals = async () => {
    await fetchFreshPage()
    await queryClient.invalidateQueries({ queryKey: ['withdrawals', chainId] })
  }

  const backgroundRefreshWithdrawals = () => {
    void refreshWithdrawals().catch((e) => {
      message.error(e instanceof Error ? e.message : 'Failed to refresh withdrawals')
    })
  }

  const fetchFreshPage = async () => {
    const fresh = await fetchWithdrawals(chainId, filters)
    queryClient.setQueryData(withdrawalQueryKey, fresh)
    return fresh
  }

  const getUnavailableReason = (
    record: Withdrawal,
    action: 'flush' | 'pause' | 'unpause' | 'execute',
  ) => {
    const flags = deriveWithdrawalActionFlags(record, challengePeriod)
    const allowed = {
      flush: flags.canFlush,
      pause: flags.canPause,
      unpause: flags.canUnpause,
      execute: flags.canExecute,
    }[action]
    if (allowed) return null
    if (record.isExecuted) return 'already executed'
    if (record.isFlushed) return 'already flushed'
    if (!record.isPending) return 'is not pending'
    if (action === 'execute' && challengePeriod === undefined) return 'challenge period is still loading'
    if (record.isPaused && action !== 'unpause') return 'is paused'
    if (!record.isPaused && action === 'unpause') return 'is not paused'
    if (flags.isExpired && action !== 'execute') return 'challenge period expired'
    if (!flags.isExpired && action === 'execute') return 'challenge period has not expired'
    return 'state changed'
  }

  const precheckAction = async (
    ids: string[],
    action: 'flush' | 'pause' | 'unpause' | 'execute',
  ) => {
    const fresh = await fetchFreshPage()
    const rowsById = new Map((fresh.items ?? []).map((item) => [item.withdrawId, item]))
    const unavailable = ids
      .map((id) => {
        const row = rowsById.get(id)
        if (!row) return `${id}: no longer visible in current filters`
        const reason = getUnavailableReason(row, action)
        return reason ? `${id}: ${reason}` : null
      })
      .filter((item): item is string => item !== null)

    if (unavailable.length > 0) {
      message.warning(`Refresh required: ${unavailable.slice(0, 3).join('; ')}`)
      await refreshWithdrawals()
      return false
    }
    return true
  }

  const runAction = async (
    ids: string[],
    action: 'flush' | 'pause' | 'unpause' | 'execute',
    submit: () => Promise<unknown>,
    successMessage: string,
  ) => {
    try {
      const submitted = await runWithdrawalAction({
        ids,
        markLoading: markRowsLoading,
        clearLoading: clearRowsLoading,
        precheck: () => precheckAction(ids, action),
        submit,
      })
      if (!submitted) return
      message.success(successMessage)
      setSelectedRowKeys([])
      backgroundRefreshWithdrawals()
      window.setTimeout(backgroundRefreshWithdrawals, 5_000)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Withdrawal action failed')
    }
  }

  const runFlushAction = async (ids: string[]) => {
    if (ids.length === 0) return
    await runAction(ids, 'flush', () => flushMut.mutateAsync(ids), 'Flush submitted')
  }

  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseWithdrawal(chainId, id),
  })

  const unpauseMut = useMutation({
    mutationFn: (id: string) => unpauseWithdrawal(chainId, id),
  })

  const executeMut = useMutation({
    mutationFn: (id: string) => executeWithdrawal(chainId, id),
  })

  const flushMut = useMutation({
    mutationFn: (ids: string[]) => flushWithdrawals(chainId, ids),
  })

  const flushableItems = data?.items?.filter((w) => deriveWithdrawalActionFlags(w, challengePeriod).canFlush) ?? []

  const handleFlushAll = () => {
    const ids = flushableItems.map((w) => w.withdrawId)
    void runFlushAction(ids)
  }

  const handleSearch = () => {
    const next = buildFilters(filters.pageSize ?? 20, form.getFieldsValue())
    setFilters(next)
    void queryClient.invalidateQueries({ queryKey: ['withdrawals', chainId] })
  }

  const handleReset = () => {
    form.resetFields()
    setFilters({ page: 1, pageSize: 20 })
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'withdrawId',
      key: 'withdrawId',
      width: 130,
      ellipsis: true,
      render: (id: string) => <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{id}</span>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      render: (val: string, record: Withdrawal) => (
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
          {formatDecimalAmount(val)}
          <span style={{ color: '#5c6a82', marginLeft: 4, fontSize: 12 }}>
            {getMeta(record.tokenAddress)?.symbol ?? ''}
          </span>
        </span>
      ),
    },
    {
      title: 'Fee',
      dataIndex: 'fee',
      key: 'fee',
      width: 120,
      render: (val: string, record: Withdrawal) => {
        const meta = getMeta(record.tokenAddress)
        return (
          <span style={{ color: '#8b95a8', whiteSpace: 'nowrap' }}>
            {formatDecimalAmount(val)}
            {meta?.symbol && <span style={{ marginLeft: 4, fontSize: 12 }}>{meta.symbol}</span>}
          </span>
        )
      },
    },
    {
      title: 'Token',
      dataIndex: 'tokenAddress',
      key: 'tokenAddress',
      width: 160,
      render: (addr: string) => (
        <div style={{ lineHeight: 1.6 }}>
          <TokenName address={addr} />
          <div><AddressLink address={addr} /></div>
        </div>
      ),
    },
    {
      title: 'To',
      dataIndex: 'toAddress',
      key: 'toAddress',
      width: 130,
      render: (addr: string) => <AddressLink address={addr} />,
    },
    {
      title: 'Pending',
      key: 'pendingState',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, record: Withdrawal) => {
        const flags = deriveWithdrawalActionFlags(record, challengePeriod)
        return (
          <Space size={4}>
            <BoolIcon value={record.isPending} />
            {flags.isAlive && flags.isExpired && (
              <Tag color="#3b82f6" style={{ margin: 0, fontSize: 10 }}>Expired</Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Paused',
      dataIndex: 'isPaused',
      key: 'isPaused',
      width: 70,
      align: 'center' as const,
      render: (v: boolean) => <BoolIcon value={v} />,
    },
    {
      title: 'Executed',
      key: 'executedState',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: Withdrawal) => (
        <Space size={4}>
          <BoolIcon value={record.isExecuted} />
          {record.isFlushed && (
            <Tag color="#8b95a8" style={{ margin: 0, fontSize: 10 }}>Flushed</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (val: string) => {
        const formatted = formatUnixSeconds(val)
        return formatted
          ? <span style={{ color: '#8b95a8', fontSize: 12 }}>{formatted}</span>
          : <span style={{ color: '#5c6a82' }}>-</span>
      },
    },
    {
      title: 'Tx',
      dataIndex: 'transactionHash',
      key: 'transactionHash',
      width: 120,
      render: (hash: string) => hash ? <AddressLink address={hash} type="tx" /> : null,
    },
    {
      title: '',
      key: 'actions',
      width: 260,
      render: (_: unknown, record: Withdrawal) => {
        if (loadingRows.has(record.withdrawId)) {
          return <LoadingOutlined style={{ color: '#3b82f6' }} />
        }
        const flags = deriveWithdrawalActionFlags(record, challengePeriod)
        return (
          <Space size={4}>
            {flags.canFlush && (
              <Popconfirm title="Flush this withdrawal?" onConfirm={() => runFlushAction([record.withdrawId])}>
                <Button size="small" style={actionButtonStyles.flush}>
                  Flush
                </Button>
              </Popconfirm>
            )}
            {flags.canPause && (
              <Popconfirm title="Pause this withdrawal?" onConfirm={() => runAction([record.withdrawId], 'pause', () => pauseMut.mutateAsync(record.withdrawId), 'Paused')}>
                <Button size="small" style={actionButtonStyles.pause}>
                  Pause
                </Button>
              </Popconfirm>
            )}
            {flags.canUnpause && (
              <Popconfirm title="Unpause this withdrawal?" onConfirm={() => runAction([record.withdrawId], 'unpause', () => unpauseMut.mutateAsync(record.withdrawId), 'Unpaused')}>
                <Button size="small" style={actionButtonStyles.unpause}>
                  Unpause
                </Button>
              </Popconfirm>
            )}
            {flags.canExecute && (
              <Popconfirm title="Execute this withdrawal? (challenge period expired)" onConfirm={() => runAction([record.withdrawId], 'execute', () => executeMut.mutateAsync(record.withdrawId), 'Execute submitted')}>
                <Button size="small" style={actionButtonStyles.execute}>
                  Execute
                </Button>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Withdrawals</div>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`Flush ${selectedRowKeys.length} withdrawal(s)?`}
              onConfirm={() => runFlushAction(selectedRowKeys)}
            >
              <Button
                type="primary"
                size="small"
                loading={flushMut.isPending || selectedRowKeys.some((id) => loadingRows.has(id))}
              >
                Flush Selected ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
          {flushableItems.length > 0 && (
            <Popconfirm title={`Flush all ${flushableItems.length} unexpired unpaused withdrawal(s)?`} onConfirm={handleFlushAll}>
              <Button
                size="small"
                loading={flushMut.isPending || flushableItems.some((item) => loadingRows.has(item.withdrawId))}
              >
                Flush All Unexpired Unpaused
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card size="small" style={{ padding: 4 }}>
        <Form form={form} layout="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Form.Item name="tokenAddress">
            <TokenSelect />
          </Form.Item>
          <Form.Item name="user">
            <Input placeholder="User address" style={{ width: 180 }} allowClear />
          </Form.Item>
          <Form.Item name="timeRange">
            <TimeRangeFilter />
          </Form.Item>
          <Form.Item name="isPending">
            <Select placeholder="Pending" style={{ width: 100 }} allowClear>
              <Select.Option value="true">Yes</Select.Option>
              <Select.Option value="false">No</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="isPaused">
            <Select placeholder="Paused" style={{ width: 100 }} allowClear>
              <Select.Option value="true">Yes</Select.Option>
              <Select.Option value="false">No</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleSearch} icon={<SearchOutlined />}>Search</Button>
              <Button onClick={handleReset} icon={<ClearOutlined />}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table<Withdrawal>
          columns={columns}
          dataSource={data?.items}
          rowKey="withdrawId"
          loading={isLoading}
          size="small"
          scroll={{ x: 1240 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
            getCheckboxProps: (record) => ({
              disabled: !deriveWithdrawalActionFlags(record, challengePeriod).canFlush,
            }),
          }}
          pagination={{
            current: data?.page ?? 1,
            pageSize: data?.pageSize ?? 20,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => <span style={{ color: '#5c6a82' }}>{total} records</span>,
            onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, pageSize })),
          }}
        />
      </Card>
    </div>
  )
}
