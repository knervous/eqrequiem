import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getQuestCatalog, listZoneShards, reloadQuestCatalog, startZoneShard, stopZoneShard } from '@/libra/api'
import type { QuestCatalogStatus, ZoneShard } from '@/libra/types'

export function ShardsPage() {
  const [shards, setShards] = useState<ZoneShard[]>([])
  const [quests, setQuests] = useState<QuestCatalogStatus | null>(null)
  const [zoneId, setZoneId] = useState('2')

  const refresh = useCallback(async () => {
    const [shardResponse, questResponse] = await Promise.all([listZoneShards(), getQuestCatalog()])
    setShards(shardResponse.shards)
    setQuests(questResponse)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Zone Shards</CardTitle>
          <CardDescription>Start and inspect isolated worker-thread zone instances.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex max-w-sm gap-2'>
            <Input min='0' onChange={(event) => setZoneId(event.target.value)} type='number' value={zoneId} />
            <Button onClick={() => void startZoneShard(Number(zoneId)).then(refresh)}>Start shard</Button>
          </div>
          <div className='space-y-2'>
            {shards.map((shard) => (
              <div className='flex items-center justify-between rounded-md border p-3' key={`${shard.zoneId}:${shard.instanceId}`}>
                <div>
                  <p className='font-medium'>Zone {shard.zoneId} / Instance {shard.instanceId}</p>
                  <p className='text-sm text-muted-foreground'>tick {shard.tick} · {shard.npcCount} NPCs · {shard.sessionCount} clients · quest r{shard.questRevision}</p>
                </div>
                <Button onClick={() => void stopZoneShard(shard.zoneId, shard.instanceId).then(refresh)} size='sm' variant='outline'>Stop</Button>
              </div>
            ))}
            {shards.length === 0 && <p className='text-sm text-muted-foreground'>No shards are running.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quest Catalog</CardTitle>
          <CardDescription>{quests ? `${quests.quests.length} quests at revision ${quests.revision}` : 'Loading catalog'}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {quests?.quests.map((quest) => <p className='text-sm' key={quest.id}>{quest.id} — zones {quest.zoneIds.join(', ')}</p>)}
          <Button onClick={() => void reloadQuestCatalog().then(setQuests)} variant='outline'>Reload quests</Button>
        </CardContent>
      </Card>
    </div>
  )
}
