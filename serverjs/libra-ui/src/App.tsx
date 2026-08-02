import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LibraShell } from '@libra/layout/libra-shell'
import { DashboardPage } from '@libra/pages/dashboard-page'
import { ReleasesPage } from '@libra/pages/releases-page'
import { TableBrowserPage } from '@libra/pages/table-browser-page'
import { ValidationPage } from '@libra/pages/validation-page'
import { ShardsPage } from '@libra/pages/shards-page'
import { ZonesPage } from '@libra/pages/zones-page'
import { ZoneWorkspacePage } from '@libra/pages/zone-workspace-page'
import { NpcsPage } from '@libra/pages/npcs-page'

const ModelViewerPage = lazy(async () => {
  const module = await import('@libra/pages/model-viewer-page')
  return { default: module.ModelViewerPage }
})

function App() {
  return (
    <Routes>
      <Route element={<LibraShell />} path='/'>
        <Route element={<DashboardPage />} index />
        <Route element={<TableBrowserPage />} path='editor' />
        <Route element={<ZonesPage />} path='zones' />
        <Route element={<ZoneWorkspacePage />} path='zones/:zoneId' />
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
