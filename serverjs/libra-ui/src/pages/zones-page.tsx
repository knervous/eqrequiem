import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { searchZones } from '@/libra/api'
import type { LibraRow } from '@/libra/types'

export function ZonesPage() {
  const [zones, setZones] = useState<LibraRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void searchZones(search).then((response) => setZones(response.rows))
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [search])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zones</CardTitle>
        <CardDescription>Zone-first workspace for metadata, spawn placement, quests, and shard inspection.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Input onChange={(event) => setSearch(event.target.value)} placeholder='Search zone name or short name…' value={search} />
        <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Short name</TableHead><TableHead>Name</TableHead><TableHead>Spawns</TableHead><TableHead>Safe point</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {zones.map((zone) => (
              <TableRow key={String(zone.id)}>
                <TableCell>{String(zone.id)}</TableCell>
                <TableCell className='font-medium'>{String(zone.short_name)}</TableCell>
                <TableCell>{String(zone.name)}</TableCell>
                <TableCell>{String(zone.spawn_count)}</TableCell>
                <TableCell>{Number(zone.safe_x).toFixed(1)}, {Number(zone.safe_y).toFixed(1)}, {Number(zone.safe_z).toFixed(1)}</TableCell>
                <TableCell><Button asChild size='sm' variant='outline'><Link to={`/editor?section=world-zones&table=zones`}>Edit</Link></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
