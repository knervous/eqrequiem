import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ShadoModelViewer } from '@requiem/Game/Model/shado-model-viewer'
import { createShadoModelViewer } from '@requiem/Game/Model/shado-model-viewer'
import type { RawRigViewer } from '@requiem/Game/Model/raw-rig-viewer'
import { createRawRigViewer, getRawRigModelKeys } from '@requiem/Game/Model/raw-rig-viewer'
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

type ViewMode = 'shado' | 'raw'

export function ModelViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shadoViewerRef = useRef<ShadoModelViewer | null>(null)
  const rawViewerRef = useRef<RawRigViewer | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('shado')
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

  const rawRigKeys = getRawRigModelKeys()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (viewMode !== 'shado') return
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
      shadoViewerRef.current = created
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
      shadoViewerRef.current = null
      delete (window as unknown as Record<string, unknown>).__libraViewer
    }
  }, [model, viewMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (viewMode !== 'raw') return
    let cancelled = false
    let viewer: RawRigViewer | null = null
    void createRawRigViewer(canvas, {
      model,
      onFrame: (value) => setFps(Math.round(value)),
      onStatus: setStatus,
    }).then((created) => {
      if (cancelled) {
        created.dispose()
        return
      }
      viewer = created
      rawViewerRef.current = created
      setAnimations(created.animations)
      if (created.animations.length) {
        setAnimation(created.animations[0])
        created.playAnimation(created.animations[0])
      }
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      viewer?.dispose()
      rawViewerRef.current = null
    }
  }, [model, viewMode])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__libraSetModel = setModel
    return () => {
      delete (window as unknown as Record<string, unknown>).__libraSetModel
    }
  }, [])

  const playAnimation = (name: string) => {
    setAnimation(name)
    if (viewMode === 'shado') shadoViewerRef.current?.playAnimation(name)
    else rawViewerRef.current?.playAnimation(name)
  }
  const setViewerWireframe = (enabled: boolean) => {
    setWireframe(enabled)
    if (viewMode === 'shado') shadoViewerRef.current?.setWireframe(enabled)
    else rawViewerRef.current?.setWireframe(enabled)
  }
  const setViewerSkeleton = (enabled: boolean, mode: 'lines' | 'spheres') => {
    setSkeletonView(enabled)
    if (viewMode === 'shado') shadoViewerRef.current?.setSkeletonViewer(enabled, mode)
    else rawViewerRef.current?.setSkeletonViewer(enabled, mode)
  }
  const resetCamera = () => {
    if (viewMode === 'shado') shadoViewerRef.current?.resetCamera()
    else rawViewerRef.current?.resetCamera()
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]'>
      <Card className='overflow-hidden'>
        <CardHeader className='flex-row items-start justify-between space-y-0'>
          <div>
            <CardTitle>Requiem Model Viewer</CardTitle>
            <CardDescription>
              {viewMode === 'shado'
                ? 'Manual PBR-candidate validation through the same Shado actor, VAT shader, baked assets, and winding rules used by the game client.'
                : 'Raw rig preview: the source GLB loaded with real Babylon skinning (no VAT). Skeleton overlay and animation playback reflect the actual rig, useful for joint-to-mesh fit checks the Shado/VAT view cannot show.'}
            </CardDescription>
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
            <CardTitle className='text-base'>View mode</CardTitle>
            <CardDescription>Shado/VAT is what ships. Raw rig is a rig-debugging tool only.</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              className='h-10 w-full rounded-md border bg-background px-3 text-sm'
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              value={viewMode}
            >
              <option value='shado'>Shado/VAT runtime (shipped path)</option>
              <option value='raw'>Raw rig preview (skeleton debug)</option>
            </select>
          </CardContent>
        </Card>

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
              {viewMode === 'shado' ? (
                <>
                  <option value='hum'>Human male — CMU mocap v11</option>
                  <option value='huf'>Human female — CMU mocap v12 (Hunyuan geometry + fixed VAT bake)</option>
                  <option value='hmc'>Human male — ComfyUI/Hunyuan POC</option>
                  <option value='hfc'>Human female — ComfyUI/Hunyuan POC</option>
                </>
              ) : (
                rawRigKeys.map((key) => <option key={key} value={key}>{key}</option>)
              )}
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Animation</CardTitle>
            <CardDescription>
              {viewMode === 'shado' ? 'All clips come from the installed runtime catalog.' : 'Clips come directly from the source GLB’s animation groups.'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <select
              className='h-10 w-full rounded-md border bg-background px-3 text-sm'
              onChange={(event) => playAnimation(event.target.value)}
              value={animation}
            >
              {animations.map((name) => <option key={name}>{name}</option>)}
            </select>
            <Button className='w-full' onClick={resetCamera} variant='secondary'>
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
              setViewerWireframe(event.target.checked)
            }} type='checkbox' /></label>
            {viewMode === 'shado' && (
              <label className='flex items-center justify-between gap-3'>Backface culling <input checked={culling} onChange={(event) => {
                setCulling(event.target.checked)
                shadoViewerRef.current?.setBackFaceCulling(event.target.checked)
              }} type='checkbox' /></label>
            )}
            <label className='flex items-center justify-between gap-3'>Skeleton overlay <input checked={skeletonView} onChange={(event) => {
              setViewerSkeleton(event.target.checked, skeletonMode)
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
                    setViewerSkeleton(true, mode)
                  }}
                >
                  <option value='lines'>Lines</option>
                  <option value='spheres'>Sphere and spurs</option>
                </select>
              </div>
            )}
            {skeletonView && viewMode === 'shado' && (
              <p className='text-xs text-muted-foreground'>
                Shows bind (rest) pose joint positions only, and often shows almost
                nothing useful: the Shado/VAT runtime bakes animation into a texture
                sampled entirely in the vertex shader and never touches this mesh's
                Babylon skeleton after import. Switch to Raw rig preview for a
                meaningful overlay, at rest or during animation.
              </p>
            )}
          </CardContent>
        </Card>

        {viewMode === 'shado' && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Appearance permutation</CardTitle>
              <CardDescription>The base slot is live. Remaining slots are shown now to keep the equipment ABI explicit as assets arrive.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <label className='flex items-center justify-between text-sm'>Race body + tunic <input checked={bodyVisible} onChange={(event) => {
                setBodyVisible(event.target.checked)
                shadoViewerRef.current?.setBodyVisible(event.target.checked)
              }} type='checkbox' /></label>
              <div className='grid grid-cols-2 gap-2'>
                {tintPresets.map((preset) => <Button key={preset.label} onClick={() => shadoViewerRef.current?.setTint(preset.value)} size='sm' variant='outline'>{preset.label}</Button>)}
              </div>
              <div className='grid grid-cols-2 gap-2'>
                {REQUIEM_APPEARANCE_SLOTS.filter((slot) => slot !== 'body').map((slot) => <div className='rounded border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground' key={slot}>{slot}: empty</div>)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
