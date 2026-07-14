import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ReleasesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Releases</CardTitle>
        <CardDescription>Reserved for release pinning/publish workflow and rollback history.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-sm text-muted-foreground'>Next step: wire this to content release metadata and publish actions.</p>
      </CardContent>
    </Card>
  )
}
