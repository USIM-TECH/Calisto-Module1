import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import WebchatPage from './pages/WebchatPage'
import LeadsPage from './pages/LeadsPage'
import ProductsPage from './pages/ProductsPage'
import KnowledgePage from './pages/KnowledgePage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/leads" replace />} />
        <Route path="/webchat" element={<WebchatPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
