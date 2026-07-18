import type {
  LibraDataResponse,
  LibraMetaColumnsResponse,
  LibraMetaTablesResponse,
  LibraRow,
  LibraValidateResponse,
  QuestCatalogStatus,
  ZoneShard,
} from '@/libra/types'

const baseUrl = import.meta.env.VITE_LIBRA_API_BASE || ''
const apiKey = import.meta.env.VITE_LIBRA_API_KEY || ''

function buildUrl(path: string): string {
  if (baseUrl.length === 0) {
    return path
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

async function libraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-libra-key': apiKey } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }

  return (await response.json()) as T
}

export async function getLibraHealth(): Promise<Record<string, unknown>> {
  return libraFetch('/libra/health')
}

export async function listContentTables(): Promise<LibraMetaTablesResponse> {
  return libraFetch('/libra/meta/tables?db=content')
}

export async function listContentColumns(table: string): Promise<LibraMetaColumnsResponse> {
  return libraFetch(`/libra/meta/columns?db=content&table=${encodeURIComponent(table)}`)
}

export async function listContentRows(table: string, limit = 100, offset = 0): Promise<LibraDataResponse> {
  return libraFetch(`/libra/data?db=content&table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`)
}

export async function searchZones(search = ''): Promise<{ count: number; rows: LibraRow[] }> {
  return libraFetch(`/libra/content/zones?search=${encodeURIComponent(search)}&limit=500`)
}

export async function searchNpcs(search = ''): Promise<{ count: number; rows: LibraRow[] }> {
  return libraFetch(`/libra/content/npcs?search=${encodeURIComponent(search)}&limit=500`)
}

export async function createContentRow(table: string, row: LibraRow): Promise<{ requestId: string; ok: boolean }> {
  return libraFetch(`/libra/data?db=content&table=${encodeURIComponent(table)}`, {
    method: 'POST',
    body: JSON.stringify({ row }),
  })
}

export async function updateContentRow(table: string, row: LibraRow): Promise<{ requestId: string; ok: boolean; updated: number }> {
  return libraFetch(`/libra/data?db=content&table=${encodeURIComponent(table)}`, {
    method: 'PUT',
    body: JSON.stringify({ row }),
  })
}

export async function deleteContentRow(table: string, key: LibraRow): Promise<{ requestId: string; ok: boolean; deleted: number }> {
  return libraFetch(`/libra/data?db=content&table=${encodeURIComponent(table)}`, {
    method: 'DELETE',
    body: JSON.stringify({ key }),
  })
}

export async function validateContent(): Promise<LibraValidateResponse> {
  return libraFetch('/libra/validate?db=content')
}

export async function listZoneShards(): Promise<{ shards: ZoneShard[] }> {
  return libraFetch('/libra/shards')
}

export async function startZoneShard(zoneId: number, instanceId = 0): Promise<{ shard: ZoneShard }> {
  return libraFetch(`/libra/shards?zoneId=${zoneId}&instanceId=${instanceId}`, { method: 'POST' })
}

export async function stopZoneShard(zoneId: number, instanceId = 0): Promise<{ stopped: boolean }> {
  return libraFetch(`/libra/shards?zoneId=${zoneId}&instanceId=${instanceId}`, { method: 'DELETE' })
}

export async function getQuestCatalog(): Promise<QuestCatalogStatus> {
  return libraFetch('/libra/quests')
}

export async function reloadQuestCatalog(): Promise<QuestCatalogStatus> {
  return libraFetch('/libra/quests', { method: 'POST' })
}
