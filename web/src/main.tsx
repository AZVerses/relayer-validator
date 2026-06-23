import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme } from 'antd'
import { App } from './App'
import { createQueryClient } from './query-client'
import './global.css'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#3b82f6',
            colorBgContainer: '#151921',
            colorBgElevated: '#1c2130',
            colorBgLayout: '#0d1117',
            colorBorder: '#2a3041',
            colorBorderSecondary: '#1e2536',
            borderRadius: 8,
            fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
            fontSize: 13,
            colorText: '#e2e8f0',
            colorTextSecondary: '#8b95a8',
            colorTextTertiary: '#5c6a82',
          },
          components: {
            Layout: {
              siderBg: '#111620',
              headerBg: '#111620',
              bodyBg: '#0d1117',
            },
            Menu: {
              darkItemBg: 'transparent',
              darkItemSelectedBg: 'rgba(59, 130, 246, 0.12)',
              darkItemHoverBg: 'rgba(255, 255, 255, 0.04)',
              darkItemSelectedColor: '#3b82f6',
            },
            Table: {
              headerBg: '#151921',
              headerColor: '#8b95a8',
              rowHoverBg: 'rgba(255, 255, 255, 0.03)',
              borderColor: '#1e2536',
              headerSplitColor: '#1e2536',
            },
            Card: {
              colorBgContainer: '#151921',
              colorBorderSecondary: '#1e2536',
            },
            Input: {
              colorBgContainer: '#111620',
              colorBorder: '#2a3041',
            },
            Select: {
              colorBgContainer: '#111620',
              colorBorder: '#2a3041',
            },
            Button: {
              borderRadius: 6,
            },
            Tag: {
              borderRadiusSM: 4,
            },
            Statistic: {
              titleFontSize: 12,
              contentFontSize: 22,
            },
          },
        }}
      >
        <App />
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
)
