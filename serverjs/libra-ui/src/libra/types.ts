export interface LibraTableMeta {
  table: string
  rowsEstimate: number
}

export interface LibraColumnMeta {
  name: string
  dataType: string
  nullable: boolean
  key: string
}

export type LibraRow = Record<string, unknown>

export interface ValidationIssue {
  code: string
  severity: 'warning' | 'error'
  table: string
  message: string
  count: number
  sample?: Array<number | string>
}

export interface LibraMetaTablesResponse {
  db: 'content' | 'runtime'
  count: number
  tables: LibraTableMeta[]
}

export interface LibraMetaColumnsResponse {
  db: 'content' | 'runtime'
  table: string
  columns: LibraColumnMeta[]
}

export interface LibraDataResponse {
  requestId: string
  db: 'content' | 'runtime'
  table: string
  limit: number
  offset: number
  count: number
  rows: LibraRow[]
}

export interface LibraValidateResponse {
  requestId: string
  db: 'content' | 'runtime'
  issueCount: number
  issues: ValidationIssue[]
}

export interface ZoneShard {
  zoneId: number
  instanceId: number
  startedAt: string
  lastMetricsAt: string | null
  tick: number
  queueDepth: number
  npcCount: number
  sessionCount: number
  questRevision: number
  questCount: number
}

export interface QuestCatalogStatus {
  revision: number
  directory: string
  quests: Array<{ id: string; zoneIds: number[] }>
}
