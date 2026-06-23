import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { OverviewPage } from './pages/overview/OverviewPage'
import { DepositsPage } from './pages/deposits/DepositsPage'
import { WithdrawalsPage } from './pages/withdrawals/WithdrawalsPage'
import { RebalancePage } from './pages/rebalance/RebalancePage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'deposits', element: <DepositsPage /> },
      { path: 'withdrawals', element: <WithdrawalsPage /> },
      { path: 'rebalance', element: <RebalancePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
