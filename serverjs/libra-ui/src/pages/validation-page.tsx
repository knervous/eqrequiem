import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { validateContent } from '@/libra/api'
import type { ValidationIssue } from '@/libra/types'

export function ValidationPage() {
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [status, setStatus] = useState('Loading...')

  async function refresh(): Promise<void> {
    try {
      setStatus('Running content validation...')
      const result = await validateContent()
      setIssues(result.issues)
      setStatus(`Found ${result.issueCount} issue(s)`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Validation</CardTitle>
        <CardDescription>Current `/libra/validate?db=content` output for publish readiness.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-3'>
          <Button onClick={() => void refresh()} variant='secondary'>
            Re-run checks
          </Button>
          <span className='text-sm text-muted-foreground'>{status}</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue, index) => (
              <TableRow key={`${issue.code}-${issue.table}-${index}`}>
                <TableCell>
                  <Badge variant={issue.severity === 'error' ? 'default' : 'secondary'}>{issue.severity}</Badge>
                </TableCell>
                <TableCell>{issue.table}</TableCell>
                <TableCell>{issue.code}</TableCell>
                <TableCell>{issue.count}</TableCell>
                <TableCell>{issue.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
