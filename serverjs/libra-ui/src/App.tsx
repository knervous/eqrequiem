import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LibraShell } from '@/layout/libra-shell'
import { DashboardPage } from '@/pages/dashboard-page'
import { ReleasesPage } from '@/pages/releases-page'
import { TableBrowserPage } from '@/pages/table-browser-page'
import { ValidationPage } from '@/pages/validation-page'
import { ShardsPage } from '@/pages/shards-page'
import { ZonesPage } from '@/pages/zones-page'
import { NpcsPage } from '@/pages/npcs-page'

const ModelViewerPage = lazy(async () => {
  const module = await import('@/pages/model-viewer-page')
  return { default: module.ModelViewerPage }
})

function App() {
  return (
    <Routes>
      <Route element={<LibraShell />} path='/'>
        <Route element={<DashboardPage />} index />
        <Route element={<TableBrowserPage />} path='editor' />
        <Route element={<ZonesPage />} path='zones' />
        <Route element={<NpcsPage />} path='npcs' />
        <Route element={<Suspense fallback={<p className='text-sm text-muted-foreground'>Loading model tools...</p>}><ModelViewerPage /></Suspense>} path='models' />
        <Route element={<ValidationPage />} path='validation' />
        <Route element={<ReleasesPage />} path='releases' />
        <Route element={<ShardsPage />} path='shards' />
      </Route>
      <Route element={<Navigate replace to='/' />} path='*' />
    </Routes>
  )
}

export default App
