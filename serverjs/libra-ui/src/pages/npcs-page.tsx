import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { searchNpcs } from '@/libra/api'
import type { LibraRow } from '@/libra/types'

export function NpcsPage() {
  const [npcs, setNpcs] = useState<LibraRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void searchNpcs(search).then((response) => setNpcs(response.rows))
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [search])

  return (
    <Card>
      <CardHeader>
        <CardTitle>NPC Archetypes</CardTitle>
        <CardDescription>Complete gameplay definitions stay independent from zone placement and weighted spawn composition.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Input onChange={(event) => setSearch(event.target.value)} placeholder='Search NPC name or key…' value={search} />
        <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Race / gender</TableHead><TableHead>Groups</TableHead><TableHead>Behavior</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {npcs.map((npc) => (
              <TableRow key={String(npc.id)}>
                <TableCell>{String(npc.id)}</TableCell>
                <TableCell><p className='font-medium'>{String(npc.name)}</p><p className='text-xs text-muted-foreground'>{String(npc.npc_key)}</p></TableCell>
                <TableCell>{String(npc.level)}</TableCell>
                <TableCell>{String(npc.race_id)} / {String(npc.gender)}</TableCell>
                <TableCell>{String(npc.spawn_group_count)}</TableCell>
                <TableCell><Badge variant='outline'>{String(npc.behavior_key ?? 'default')}</Badge></TableCell>
                <TableCell><Button asChild size='sm' variant='outline'><Link to='/editor?section=npc-spawns&table=npc_archetypes'>Edit</Link></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
