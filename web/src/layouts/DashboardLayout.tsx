import { Layout, Menu, Space } from 'antd'
import {
  AppstoreOutlined,
  DownloadOutlined,
  UploadOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { ChainSelector } from '../components/ChainSelector'
import { ValidatorBadge } from '../components/ValidatorBadge'

const { Header, Sider, Content } = Layout

export function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    { key: '/', icon: <AppstoreOutlined />, label: 'Overview' },
    { key: '/deposits', icon: <DownloadOutlined />, label: 'Deposits' },
    { key: '/withdrawals', icon: <UploadOutlined />, label: 'Withdrawals' },
    { key: '/rebalance', icon: <SwapOutlined />, label: 'Rebalance' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        theme="dark"
        style={{ borderRight: '1px solid #1e2536' }}
      >
        <div style={{ padding: '20px 20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            V
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.2 }}>Asset Vault</div>
          </div>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', padding: '0 8px' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e2536',
            height: 56,
            lineHeight: '56px',
          }}
        >
          <ChainSelector />
          <Space size={12}>
            <ValidatorBadge />
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
