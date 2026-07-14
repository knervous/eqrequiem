import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  createContentRow,
  deleteContentRow,
  listContentColumns,
  listContentRows,
  listContentTables,
  updateContentRow,
} from '@/libra/api'
import { GENERIC_SECTION_ID, LIBRA_SECTIONS } from '@/libra/sections'
import type { LibraColumnMeta, LibraRow, LibraTableMeta } from '@/libra/types'

export function TableBrowserPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSection = searchParams.get('section') ?? GENERIC_SECTION_ID
  const initialTable = searchParams.get('table') ?? ''

  const [tables, setTables] = useState<LibraTableMeta[]>([])
  const [tableSearch, setTableSearch] = useState('')
  const [table, setTable] = useState(initialTable)
  const [sectionId, setSectionId] = useState(initialSection)
  const [columns, setColumns] = useState<LibraColumnMeta[]>([])
  const [rows, setRows] = useState<LibraRow[]>([])
  const [rowPayload, setRowPayload] = useState('{}')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const primaryKeys = useMemo(() => columns.filter((column) => column.key === 'PRI').map((column) => column.name), [columns])

  const section = useMemo(() => LIBRA_SECTIONS.find((entry) => entry.id === sectionId), [sectionId])

  const sectionTables = useMemo(() => {
    if (!section) {
      return tables
    }
    const sectionSet = new Set(section.tables)
    return tables.filter((entry) => sectionSet.has(entry.table))
  }, [section, tables])

  const filteredBaseTables = section ? sectionTables : tables

  const visibleTables = useMemo(
    () => filteredBaseTables.filter((entry) => entry.table.toLowerCase().includes(tableSearch.toLowerCase())),
    [filteredBaseTables, tableSearch],
  )

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const response = await listContentTables()
        setTables(response.tables)

        const availableNames = new Set(response.tables.map((entry) => entry.table))
        if (initialTable && availableNames.has(initialTable)) {
          setTable(initialTable)
        } else if (response.tables.length > 0) {
          setTable(response.tables[0].table)
        }

        setStatus(`Loaded ${response.tables.length} tables`)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }
    })()
  }, [initialTable])

  useEffect(() => {
    if (!table) {
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('table', table)
    next.set('section', sectionId)
    setSearchParams(next, { replace: true })
    void refreshTableData(table)
  }, [table, sectionId, searchParams, setSearchParams])

  async function refreshTables() {
    setLoading(true)
    try {
      const response = await listContentTables()
      setTables(response.tables)
      if (!table && response.tables.length > 0) {
        setTable(response.tables[0].table)
      }
      setStatus(`Loaded ${response.tables.length} tables`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  async function refreshTableData(activeTable: string) {
    setLoading(true)
    try {
      const [colResponse, rowResponse] = await Promise.all([listContentColumns(activeTable), listContentRows(activeTable, 100, 0)])
      setColumns(colResponse.columns)
      setRows(rowResponse.rows)
      if (rowResponse.rows[0]) {
        setRowPayload(JSON.stringify(rowResponse.rows[0], null, 2))
      } else {
        setRowPayload('{}')
      }
      setStatus(`Loaded ${activeTable}: ${rowResponse.count} row(s)`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  function safeParsePayload(): LibraRow {
    const parsed: unknown = JSON.parse(rowPayload)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Payload must be a JSON object')
    }
    return parsed as LibraRow
  }

  async function onCreate() {
    if (!table) return
    const payload = safeParsePayload()
    await createContentRow(table, payload)
    await refreshTableData(table)
  }

  async function onUpdate() {
    if (!table) return
    const payload = safeParsePayload()
    await updateContentRow(table, payload)
    await refreshTableData(table)
  }

  async function onDelete() {
    if (!table) return
    const payload = safeParsePayload()
    const key = primaryKeys.reduce<LibraRow>((acc, name) => {
      acc[name] = payload[name]
      return acc
    }, {})
    await deleteContentRow(table, key)
    await refreshTableData(table)
  }

  function projectVisibleColumns(): LibraColumnMeta[] {
    return columns.slice(0, 8)
  }

  function onSectionChange(nextSection: string): void {
    setSectionId(nextSection)
    if (nextSection === GENERIC_SECTION_ID) {
      return
    }

    const targetSection = LIBRA_SECTIONS.find((entry) => entry.id === nextSection)
    if (!targetSection) {
      return
    }

    const available = targetSection.tables.find((name) => tables.some((tableMeta) => tableMeta.table === name))
    if (available) {
      setTable(available)
    }
  }

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Content Editor</CardTitle>
          <CardDescription>Curated domain sections plus full generic CRUD fallback for complete table coverage.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Tabs onValueChange={onSectionChange} value={sectionId}>
            <TabsList className='h-auto flex-wrap'>
              {LIBRA_SECTIONS.map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id}>
                  {entry.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value={GENERIC_SECTION_ID}>All Tables</TabsTrigger>
            </TabsList>

            {LIBRA_SECTIONS.map((entry) => (
              <TabsContent key={entry.id} value={entry.id}>
                <p className='text-sm text-muted-foreground'>{entry.description}</p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {entry.tables
                    .filter((name) => tables.some((tableMeta) => tableMeta.table === name))
                    .map((name) => (
                      <Button key={name} onClick={() => setTable(name)} size='sm' variant={table === name ? 'default' : 'outline'}>
                        {name}
                      </Button>
                    ))}
                </div>
              </TabsContent>
            ))}

            <TabsContent value={GENERIC_SECTION_ID}>
              <p className='text-sm text-muted-foreground'>Browse/edit any table directly in generic mode.</p>
            </TabsContent>
          </Tabs>

          <div className='grid gap-3 md:grid-cols-[1fr_280px_120px]'>
            <Input onChange={(event) => setTableSearch(event.target.value)} placeholder='Filter tables...' value={tableSearch} />
            <Select onValueChange={setTable} value={table}>
              <SelectTrigger>
                <SelectValue placeholder='Select table' />
              </SelectTrigger>
              <SelectContent>
                {visibleTables.map((entry) => (
                  <SelectItem key={entry.table} value={entry.table}>
                    {entry.table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void (table ? refreshTableData(table) : refreshTables())} variant='secondary'>
              <RefreshCw className='mr-2 h-4 w-4' /> Refresh
            </Button>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{loading ? 'Loading...' : 'Ready'}</Badge>
            <span className='text-sm text-muted-foreground'>{status}</span>
            {primaryKeys.length > 0 ? <Badge variant='outline'>PK: {primaryKeys.join(', ')}</Badge> : null}
            {section ? <Badge variant='outline'>Section: {section.label}</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <Tabs className='space-y-4' defaultValue='rows'>
        <TabsList>
          <TabsTrigger value='rows'>Rows</TabsTrigger>
          <TabsTrigger value='crud'>CRUD Payload</TabsTrigger>
        </TabsList>

        <TabsContent value='rows'>
          <Card>
            <CardContent className='pt-6'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {projectVisibleColumns().map((column) => (
                      <TableHead key={column.name}>{column.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow className='cursor-pointer' key={index} onClick={() => setRowPayload(JSON.stringify(row, null, 2))}>
                      {projectVisibleColumns().map((column) => (
                        <TableCell key={column.name}>{String(row[column.name] ?? '')}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='crud'>
          <Card>
            <CardHeader>
              <CardTitle>Payload Editor</CardTitle>
              <CardDescription>Use one JSON object for create/update and primary-key delete.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Textarea className='min-h-[320px] font-mono text-xs' onChange={(event) => setRowPayload(event.target.value)} value={rowPayload} />
              <div className='flex flex-wrap gap-2'>
                <Button onClick={() => void onCreate()}>Create</Button>
                <Button onClick={() => void onUpdate()} variant='secondary'>
                  Update
                </Button>
                <Button onClick={() => void onDelete()} variant='destructive'>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
