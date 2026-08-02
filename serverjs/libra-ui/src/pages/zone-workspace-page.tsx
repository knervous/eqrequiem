import { ArrowLeft, MapPin, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@libra/components/ui/badge'
import { Button } from '@libra/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libra/components/ui/card'
import { Input } from '@libra/components/ui/input'
import { createZoneSpawn, getZoneWorkspace, searchNpcs } from '@libra/libra/api'
import type { LibraRow, ZoneWorkspace, ZoneWorkspaceSpawn } from '@libra/libra/types'
import type { RuntimePoint, ZoneSpawnViewer } from '@libra/libra/zone-spawn-viewer'

export function ZoneWorkspacePage() {
  const params = useParams()
  const zoneId = Number(params.zoneId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<ZoneSpawnViewer | null>(null)
  const [workspace, setWorkspace] = useState<ZoneWorkspace | null>(null)
  const [spawns, setSpawns] = useState<ZoneWorkspaceSpawn[]>([])
  const [draft, setDraft] = useState<RuntimePoint | null>(null)
  const [npcQuery, setNpcQuery] = useState('')
  const [npcs, setNpcs] = useState<LibraRow[]>([])
  const [npcId, setNpcId] = useState<number | null>(null)
  const [heading, setHeading] = useState('0')
  const [respawnSeconds, setRespawnSeconds] = useState('360')
  const [status, setStatus] = useState('Loading zone workspace…')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      setError('The zone id is invalid.')
      return
    }
    let cancelled = false
    void getZoneWorkspace(zoneId).then((loaded) => {
      if (cancelled) return
      setWorkspace(loaded)
      setSpawns(loaded.spawns)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(toMessage(reason))
    })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !workspace) return
    let disposed = false
    let viewer: ZoneSpawnViewer | null = null
    void import('@libra/libra/zone-spawn-viewer').then(async (module) => {
      const created = await module.createZoneSpawnViewer(
        canvas,
        workspace,
        (point) => {
          setDraft(point)
          viewerRef.current?.setDraft(point)
        },
        setStatus,
      )
      if (disposed) {
        created.dispose()
        return
      }
      viewer = created
      viewerRef.current = created
    }).catch((reason: unknown) => setError(toMessage(reason)))
    return () => {
      disposed = true
      viewer?.dispose()
      viewerRef.current = null
    }
  }, [workspace])

  useEffect(() => {
    if (npcQuery.trim().length < 2) {
      setNpcs([])
      return
    }
    const timeout = window.setTimeout(() => {
      void searchNpcs(npcQuery)
        .then((response) => setNpcs(response.rows.slice(0, 40)))
        .catch((reason: unknown) => setError(toMessage(reason)))
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [npcQuery])

  useEffect(() => {
    viewerRef.current?.setDraft(draft)
  }, [draft])

  const saveSpawn = async () => {
    if (!draft || npcId === null) return
    setSaving(true)
    setError('')
    try {
      const response = await createZoneSpawn(zoneId, {
        ...draft,
        heading: Number(heading),
        npcArchetypeId: npcId,
        respawnSeconds: Number(respawnSeconds),
      })
      const nextSpawns = [...spawns, response.spawn]
      setSpawns(nextSpawns)
      viewerRef.current?.setSpawns(nextSpawns)
      viewerRef.current?.setDraft(null)
      setDraft(null)
      setStatus(`Created spawn ${response.spawn.id}`)
    } catch (reason) {
      setError(toMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const selectedNpc = npcs.find((npc) => Number(npc.id) === npcId)
  const numericHeading = Number(heading)
  const numericRespawnSeconds = Number(respawnSeconds)
  const canSave = Boolean(
    draft
    && npcId !== null
    && Number.isFinite(numericHeading)
    && Number.isInteger(numericRespawnSeconds)
    && numericRespawnSeconds > 0
    && numericRespawnSeconds <= 86_400
  )

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Button asChild size='sm' variant='outline'>
            <Link to='/zones'><ArrowLeft className='mr-2 h-4 w-4' />Zones</Link>
          </Button>
          <div>
            <h1 className='text-2xl font-semibold'>
              {workspace ? String(workspace.zone.name) : `Zone ${zoneId}`}
            </h1>
            <p className='text-sm text-muted-foreground'>
              {workspace ? String(workspace.zone.short_name) : 'Loading…'} · visual spawn placement
            </p>
          </div>
        </div>
        <div className='flex gap-2'>
          <Badge variant='secondary'>{spawns.length} spawns</Badge>
          <Badge>{status}</Badge>
        </div>
      </div>

      {error && (
        <Card className='border-destructive'>
          <CardContent className='pt-6 text-sm text-destructive'>{error}</CardContent>
        </Card>
      )}

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]'>
        <Card className='overflow-hidden'>
          <CardHeader>
            <CardTitle>Zone placement view</CardTitle>
            <CardDescription>
              Drag to orbit. Scroll to zoom. Click navigable geometry to set the draft marker.
              Marker coordinates are written directly in canonical Babylon runtime space.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <canvas
              className='h-[720px] w-full rounded-lg border bg-slate-950 outline-none'
              ref={canvasRef}
            />
          </CardContent>
        </Card>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <MapPin className='h-4 w-4' />Draft spawn
              </CardTitle>
              <CardDescription>
                One save creates the spawn group, member, and point in a single audited transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-3 gap-2'>
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <label className='space-y-1 text-xs text-muted-foreground' key={axis}>
                    {axis.toUpperCase()}
                    <Input
                      onChange={(event) => setDraft((current) => ({
                        x: current?.x ?? 0,
                        y: current?.y ?? 0,
                        z: current?.z ?? 0,
                        [axis]: Number(event.target.value),
                      }))}
                      type='number'
                      value={draft?.[axis] ?? ''}
                    />
                  </label>
                ))}
              </div>
              <label className='space-y-1 text-xs text-muted-foreground'>
                Heading
                <Input onChange={(event) => setHeading(event.target.value)} type='number' value={heading} />
              </label>
              <label className='space-y-1 text-xs text-muted-foreground'>
                Respawn seconds
                <Input onChange={(event) => setRespawnSeconds(event.target.value)} type='number' value={respawnSeconds} />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>NPC archetype</CardTitle>
              <CardDescription>
                Search canonical Libra content, then choose the initial group member.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Input
                onChange={(event) => setNpcQuery(event.target.value)}
                placeholder='Search NPC name…'
                value={npcQuery}
              />
              <select
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                onChange={(event) => setNpcId(event.target.value ? Number(event.target.value) : null)}
                value={npcId ?? ''}
              >
                <option value=''>Choose NPC…</option>
                {npcs.map((npc) => (
                  <option key={String(npc.id)} value={Number(npc.id)}>
                    {String(npc.name)} · L{String(npc.level)} · #{String(npc.id)}
                  </option>
                ))}
              </select>
              {selectedNpc && (
                <p className='text-xs text-muted-foreground'>
                  {String(selectedNpc.npc_key)}
                </p>
              )}
              <Button
                className='w-full'
                disabled={!canSave || saving}
                onClick={() => void saveSpawn()}
              >
                <Plus className='mr-2 h-4 w-4' />
                {saving ? 'Creating…' : 'Create spawn'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
