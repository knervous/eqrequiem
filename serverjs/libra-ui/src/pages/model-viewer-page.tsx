import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ShadoModelViewer } from '@requiem/Game/Model/shado-model-viewer'
import { createShadoModelViewer } from '@requiem/Game/Model/shado-model-viewer'
import { REQUIEM_APPEARANCE_SLOTS } from '@requiem/Game/Model/appearance-slots'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const tintPresets = [
  { label: 'Default', value: [1, 1, 1] as const },
  { label: 'Warm', value: [1, 0.82, 0.68] as const },
  { label: 'Cool', value: [0.72, 0.84, 1] as const },
  { label: 'Dark', value: [0.52, 0.42, 0.36] as const },
]

export function ModelViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<ShadoModelViewer | null>(null)
  const [status, setStatus] = useState('Loading Requiem runtime...')
  const [model, setModel] = useState('hum')
  const [animation, setAnimation] = useState('Idle')
  const [animations, setAnimations] = useState<string[]>([])
  const [fps, setFps] = useState(0)
  const [wireframe, setWireframe] = useState(false)
  const [culling, setCulling] = useState(true)
  const [bodyVisible, setBodyVisible] = useState(true)
  const [skeletonView, setSkeletonView] = useState(false)
  const [skeletonMode, setSkeletonMode] = useState<'lines' | 'spheres'>('lines')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let viewer: ShadoModelViewer | null = null
    void createShadoModelViewer(canvas, {
      model,
      assetBaseUrl: import.meta.env.VITE_REQUIEM_ASSET_BASE ?? '/eqrequiem',
      onFrame: (value) => setFps(Math.round(value)),
      onStatus: setStatus,
    }).then((created) => {
      if (cancelled) {
        created.dispose()
        return
      }
      viewer = created
      viewerRef.current = created
      setAnimations(created.animations.map((entry) => entry.name))
      setAnimation('Idle')
      created.playAnimation('Idle')
      setStatus('Live Shado/VAT render')
      // Headless validation hook: render-shado-runtime.mjs drives the live
      // viewer deterministically through this handle.
      ;(window as unknown as Record<string, unknown>).__libraViewer = created
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      viewer?.dispose()
      viewerRef.current = null
      delete (window as unknown as Record<string, unknown>).__libraViewer
    }
  }, [model])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__libraSetModel = setModel
    return () => {
      delete (window as unknown as Record<string, unknown>).__libraSetModel
    }
  }, [])

  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]'>
      <Card className='overflow-hidden'>
        <CardHeader className='flex-row items-start justify-between space-y-0'>
          <div>
            <CardTitle>Requiem Model Viewer</CardTitle>
            <CardDescription>Manual PBR-candidate validation through the same Shado actor, VAT shader, baked assets, and winding rules used by the game client.</CardDescription>
          </div>
          <div className='flex gap-2'>
            <Badge variant='secondary'>{fps} FPS</Badge>
            <Badge>{status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <canvas className='h-[680px] w-full rounded-lg border bg-slate-950 outline-none' ref={canvasRef} />
        </CardContent>
      </Card>

      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Character</CardTitle>
            <CardDescription>Compare the authored EQ-reference candidates with the ComfyUI/Hunyuan POC bodies on the same skeleton and clips.</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              className='h-10 w-full rounded-md border bg-background px-3 text-sm'
              onChange={(event) => setModel(event.target.value)}
              value={model}
            >
              <option value='hum'>Human male — CMU mocap v11</option>
              <option value='huf'>Human female — CMU mocap v12 (Hunyuan geometry + fixed VAT bake)</option>
              <option value='hmc'>Human male — ComfyUI/Hunyuan POC</option>
              <option value='hfc'>Human female — ComfyUI/Hunyuan POC</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Animation</CardTitle>
            <CardDescription>All clips come from the installed runtime catalog.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <select
              className='h-10 w-full rounded-md border bg-background px-3 text-sm'
              onChange={(event) => {
                setAnimation(event.target.value)
                viewerRef.current?.playAnimation(event.target.value)
              }}
              value={animation}
            >
              {animations.map((name) => <option key={name}>{name}</option>)}
            </select>
            <Button className='w-full' onClick={() => viewerRef.current?.resetCamera()} variant='secondary'>
              <RotateCcw className='mr-2 h-4 w-4' /> Reset camera
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Render validation</CardTitle>
            <CardDescription>Backface culling is intentionally on by default so inverted winding fails visibly.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <label className='flex items-center justify-between gap-3'>Wireframe <input checked={wireframe} onChange={(event) => {
              setWireframe(event.target.checked)
              viewerRef.current?.setWireframe(event.target.checked)
            }} type='checkbox' /></label>
            <label className='flex items-center justify-between gap-3'>Backface culling <input checked={culling} onChange={(event) => {
              setCulling(event.target.checked)
              viewerRef.current?.setBackFaceCulling(event.target.checked)
            }} type='checkbox' /></label>
            <label className='flex items-center justify-between gap-3'>Skeleton overlay <input checked={skeletonView} onChange={(event) => {
              setSkeletonView(event.target.checked)
              viewerRef.current?.setSkeletonViewer(event.target.checked, skeletonMode)
            }} type='checkbox' /></label>
            {skeletonView && (
              <div className='flex items-center justify-between gap-3'>
                <span className='text-muted-foreground'>Display mode</span>
                <select
                  className='h-8 rounded-md border bg-background px-2 text-sm'
                  value={skeletonMode}
                  onChange={(event) => {
                    const mode = event.target.value as 'lines' | 'spheres'
                    setSkeletonMode(mode)
                    viewerRef.current?.setSkeletonViewer(true, mode)
                  }}
                >
                  <option value='lines'>Lines</option>
                  <option value='spheres'>Sphere and spurs</option>
                </select>
              </div>
            )}
            {skeletonView && (
              <p className='text-xs text-muted-foreground'>
                Shows bind (rest) pose joint positions. The Shado/VAT runtime animates
                vertices entirely in the shader, so this overlay does not track the
                currently playing clip — it is a rest-pose rig-fit check only.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Appearance permutation</CardTitle>
            <CardDescription>The base slot is live. Remaining slots are shown now to keep the equipment ABI explicit as assets arrive.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <label className='flex items-center justify-between text-sm'>Race body + tunic <input checked={bodyVisible} onChange={(event) => {
              setBodyVisible(event.target.checked)
              viewerRef.current?.setBodyVisible(event.target.checked)
            }} type='checkbox' /></label>
            <div className='grid grid-cols-2 gap-2'>
              {tintPresets.map((preset) => <Button key={preset.label} onClick={() => viewerRef.current?.setTint(preset.value)} size='sm' variant='outline'>{preset.label}</Button>)}
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {REQUIEM_APPEARANCE_SLOTS.filter((slot) => slot !== 'body').map((slot) => <div className='rounded border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground' key={slot}>{slot}: empty</div>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
