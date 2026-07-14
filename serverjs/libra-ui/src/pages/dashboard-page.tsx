import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getLibraHealth, listContentTables } from '@/libra/api'
import { LIBRA_SECTIONS } from '@/libra/sections'
import type { LibraTableMeta } from '@/libra/types'

export function DashboardPage() {
  const [tables, setTables] = useState<LibraTableMeta[]>([])
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    void (async () => {
      const [tablesResponse, healthResponse] = await Promise.all([listContentTables(), getLibraHealth()])
      setTables(tablesResponse.tables)
      setHealth(healthResponse)
    })()
  }, [])

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Libra Content Editing</CardTitle>
          <CardDescription>Broad-strokes editor shell for world/content operations over content DB.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 md:grid-cols-3'>
          <StatCard label='Content Tables' value={String(tables.length)} />
          <StatCard label='Backend Service' value={health ? 'Connected' : 'Loading'} />
          <StatCard label='Mode' value={String(health?.mode ?? 'Loading')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>High-Level Sections</CardTitle>
          <CardDescription>Starting structure for a 100+ table editing surface.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 md:grid-cols-2'>
          {LIBRA_SECTIONS.map((section) => (
            <Section copy={section.description} key={section.id} sectionId={section.id} title={section.label} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border bg-muted/40 p-4'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='mt-1 text-2xl font-semibold'>{value}</p>
    </div>
  )
}

function Section({ title, copy, sectionId }: { title: string; copy: string; sectionId: string }) {
  return (
    <div className='rounded-md border p-4'>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{copy}</p>
      <div className='mt-3'>
        <Button asChild size='sm' variant='outline'>
          <Link to={`/editor?section=${sectionId}`}>Open Section</Link>
        </Button>
      </div>
    </div>
  )
}
