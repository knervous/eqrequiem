import { Boxes, Cuboid, Database, FileCheck2, LayoutDashboard, Map, PencilRuler, UsersRound } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/zones', label: 'Zones', icon: Map },
  { to: '/npcs', label: 'NPCs & Spawns', icon: UsersRound },
  { to: '/models', label: 'Model Viewer', icon: Cuboid },
  { to: '/editor', label: 'Content Editor', icon: PencilRuler },
  { to: '/validation', label: 'Validation', icon: FileCheck2 },
  { to: '/releases', label: 'Releases', icon: Database },
  { to: '/shards', label: 'Zone Shards', icon: Boxes },
]

export function LibraShell() {
  return (
    <div className='min-h-screen bg-grain-grid'>
      <header className='border-b border-border/70 bg-background/80 backdrop-blur'>
        <div className='container flex h-16 items-center justify-between'>
          <div className='flex items-center gap-3'>
            <Link className='text-lg font-semibold tracking-tight' to='/'>
              Libra
            </Link>
            <Badge variant='secondary'>content</Badge>
          </div>
          <p className='text-sm text-muted-foreground'>Shadows of Eltania world editor</p>
        </div>
      </header>

      <div className='container grid gap-6 py-6 md:grid-cols-[230px_1fr]'>
        <aside className='rounded-lg border bg-card/90 p-3'>
          <nav className='grid gap-1'>
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )
                  }
                  key={item.to}
                  to={item.to}
                >
                  <Icon className='h-4 w-4' />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
