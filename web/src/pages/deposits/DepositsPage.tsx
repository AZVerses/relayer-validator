import { useState } from 'react'
import { Card, Table, Input, Space, Button, Form } from 'antd'
import { SearchOutlined, ClearOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { fetchDeposits } from '../../api/admin/deposits'
import { useChainStore } from '../../stores/chain'
import { useTokenMetaMap } from '../../hooks/useTokenMeta'
import { AddressLink } from '../../components/AddressLink'
import { StatusTag } from '../../components/StatusTag'
import { TokenSelect } from '../../components/TokenSelect'
import { TokenName } from '../../components/TokenName'
import { TimeRangeFilter, type TimeRangeValue } from '../../components/TimeRangeSelect'
import { formatDecimalAmount, formatUnixSeconds } from '../../utils/format'
import type { Deposit, DepositFilters } from '../../types/deposit'

function buildFilters(pageSize: number, values?: Record<string, unknown>): DepositFilters {
  const f: DepositFilters = { page: 1, pageSize }
  if (!values) return f
  const user = (values.user as string)?.trim()
  if (user) f.user = user
  const token = values.tokenAddress as string | undefined
  if (token) f.tokenAddress = token
  const tr = values.timeRange as TimeRangeValue | undefined
  if (tr?.startTimestamp) f.startTimestamp = tr.startTimestamp
  if (tr?.endTimestamp) f.endTimestamp = tr.endTimestamp
  return f
}

export function DepositsPage() {
  const chainId = useChainStore((s) => s.selectedChainId)
  const { data: metaMap } = useTokenMetaMap()
  const [filters, setFilters] = useState<DepositFilters>({ page: 1, pageSize: 20 })
  const [searchTick, setSearchTick] = useState(0)
  const [form] = Form.useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['deposits', chainId, filters, searchTick],
    queryFn: () => fetchDeposits(chainId, filters),
  })

  const getMeta = (addr: string) => metaMap?.get(addr.toLowerCase())

  const handleSearch = () => {
    setSearchTick((t) => t + 1)
    setFilters(buildFilters(filters.pageSize ?? 20, form.getFieldsValue()))
  }

  const handleReset = () => {
    form.resetFields()
    setFilters({ page: 1, pageSize: 20 })
  }

  const columns = [
    {
      title: 'Request ID',
      dataIndex: 'requestId',
      key: 'requestId',
      width: 130,
      ellipsis: true,
      render: (id: string) => <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{id}</span>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      render: (val: string, record: Deposit) => (
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
          {formatDecimalAmount(val)}
          <span style={{ color: '#5c6a82', marginLeft: 4, fontSize: 12 }}>
            {getMeta(record.tokenAddress)?.symbol ?? ''}
          </span>
        </span>
      ),
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
      title: 'From',
      dataIndex: 'fromAddress',
      key: 'fromAddress',
      width: 140,
      render: (addr: string) => <AddressLink address={addr} />,
    },
    {
      title: 'Timestamp',
      dataIndex: 'transactionTime',
      key: 'timestamp',
      width: 170,
      render: (val: number) => {
        const formatted = formatUnixSeconds(val)
        return formatted
          ? <span style={{ color: '#8b95a8', fontSize: 12 }}>{formatted}</span>
          : <span style={{ color: '#5c6a82' }}>-</span>
      },
    },
    {
      title: 'Tx Hash',
      dataIndex: 'transactionHash',
      key: 'transactionHash',
      width: 130,
      render: (hash: string) => hash ? <AddressLink address={hash} type="tx" /> : <span style={{ color: '#5c6a82' }}>-</span>,
    },
    {
      title: 'Status',
      dataIndex: 'transactionStatus',
      key: 'transactionStatus',
      width: 110,
      render: (status: string) => <StatusTag status={status} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Deposits</div>

      <Card size="small" style={{ padding: 4 }}>
        <Form form={form} layout="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Form.Item name="tokenAddress">
            <TokenSelect />
          </Form.Item>
          <Form.Item name="user">
            <Input placeholder="User address" style={{ width: 200 }} allowClear />
          </Form.Item>
          <Form.Item name="timeRange">
            <TimeRangeFilter />
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
        <Table<Deposit>
          columns={columns}
          dataSource={data?.items}
          rowKey="requestId"
          loading={isLoading}
          size="small"
          scroll={{ x: 1000 }}
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
