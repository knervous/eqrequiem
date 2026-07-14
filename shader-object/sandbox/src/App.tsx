import { useLayoutEffect, useRef, useState } from 'react'
import { Playground } from './Playground'
import { MsdfReferencePlayground } from './MsdfReferencePlayground'
import { LeanPassPlayground } from './LeanPassPlayground'
import * as BABYLON from '@babylonjs/core'
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import './App.css'

type RenderBackend = 'webgl2' | 'webgpu'

function getRoutePath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function isWebGPUCanvasContext(value: unknown): value is { configure: (...args: unknown[]) => void } {
  return !!value && typeof (value as { configure?: unknown }).configure === 'function'
}

function getInitialBackend(): RenderBackend {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('backend')
  if (fromUrl === 'webgpu' || fromUrl === 'webgl2') return fromUrl
  const stored = window.localStorage.getItem('shado:sandbox:backend')
  return stored === 'webgpu' ? 'webgpu' : 'webgl2'
}

function persistBackend(backend: RenderBackend) {
  window.localStorage.setItem('shado:sandbox:backend', backend)
  const url = new URL(window.location.href)
  url.searchParams.set('backend', backend)
  window.history.replaceState(null, '', url)
}

async function createBabylonEngine(canvas: HTMLCanvasElement, backend: RenderBackend) {
  if (backend === 'webgpu') {
    if (!navigator.gpu || !(await WebGPUEngine.IsSupportedAsync)) {
      throw new Error('WebGPU is not available in this browser.')
    }

    const getContext = canvas.getContext.bind(canvas) as (contextId: 'webgpu') => unknown
    const context = getContext('webgpu')
    if (!isWebGPUCanvasContext(context)) {
      throw new Error('This canvas cannot create a WebGPU context. Try a fresh page load or use WebGL2.')
    }

    const engine = new WebGPUEngine(canvas, {
      antialias: true,
    })

    try {
      await engine.initAsync()
      return engine
    } catch (error) {
      try {
        engine.dispose()
      } catch {
        // Babylon may fail before the WebGPU device is fully initialized.
      }
      throw error
    }
  }

  return new BABYLON.Engine(canvas, true, {
    disableWebGL2Support: false,
  })
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [backend, setBackend] = useState<RenderBackend>(getInitialBackend)
  const [activeBackend, setActiveBackend] = useState<RenderBackend | 'loading'>(backend)
  const [engineError, setEngineError] = useState<string | null>(null)

  useLayoutEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false

    const initBabylon = async () => {
      if (!canvasRef.current) return

      const canvas = canvasRef.current
      setActiveBackend('loading')
      setEngineError(null)
      let engine: BABYLON.AbstractEngine | undefined
      
      try {
        engine = await createBabylonEngine(canvas, backend)
        persistBackend(backend)

        const routePath = getRoutePath()
        const playground =
          routePath === '/msdf'
            ? MsdfReferencePlayground
            : routePath === '/lean'
              ? LeanPassPlayground
              : Playground
        const scene = await playground.CreateScene(engine as BABYLON.Engine, canvas)

        if (cancelled) {
          scene.dispose()
          engine.stopRenderLoop()
          engine.dispose()
          return
        }
        setActiveBackend(backend)
        const activeEngine = engine
        let disposed = false
        let resizeFrame = 0
        let resizeCount = 0
        let lastResizeAt = 0
        
        activeEngine.runRenderLoop(() => {
          if (disposed || activeEngine.isDisposed || scene.isDisposed) return
          scene.render()
        })

        const handleResize = () => {
          if (disposed || activeEngine.isDisposed) return
          if (resizeFrame) return
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0
            if (disposed || activeEngine.isDisposed) return

            const width = canvas.clientWidth
            const height = canvas.clientHeight
            const renderWidth = activeEngine.getRenderWidth()
            const renderHeight = activeEngine.getRenderHeight()
            if (width === renderWidth && height === renderHeight) return

            resizeCount += 1
            lastResizeAt = performance.now()
            if (backend === 'webgpu') {
              console.debug('[sandbox/webgpu] resize', {
                resizeCount,
                client: { width, height },
                render: { width: renderWidth, height: renderHeight },
              })
            }
            activeEngine.resize()
          })
        }

        const webgpuDevice = (activeEngine as any)._device
        const handleWebGPUError = (event: Event) => {
          const error = (event as any).error
          console.debug('[sandbox/webgpu] uncaptured error context', {
            message: error?.message ?? String(error),
            msSinceResize: lastResizeAt ? performance.now() - lastResizeAt : null,
            resizeCount,
          })
        }
        if (backend === 'webgpu') {
          webgpuDevice?.addEventListener?.('uncapturederror', handleWebGPUError)
        }
        
        window.addEventListener('resize', handleResize)
        
        cleanup = () => {
          disposed = true
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
          window.removeEventListener('resize', handleResize)
          webgpuDevice?.removeEventListener?.('uncapturederror', handleWebGPUError)
          activeEngine.stopRenderLoop()
          scene.dispose()
          activeEngine.dispose()
        }
      } catch (error) {
        console.error('Failed to initialize Babylon.js scene:', error)
        engine?.stopRenderLoop()
        engine?.dispose()
        setEngineError(error instanceof Error ? error.message : String(error))
        if (!cancelled && backend === 'webgpu') {
          setBackend('webgl2')
        }
      }
    }

    initBabylon()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [backend])

  const routeLabel = getRoutePath()

  return (
    <div className="app-container">
      <div className="backend-toggle" role="group" aria-label="Render backend">
        <span className="backend-toggle__route">{routeLabel}</span>
        <button
          type="button"
          className={backend === 'webgl2' ? 'is-active' : ''}
          onClick={() => setBackend('webgl2')}
        >
          WebGL2
        </button>
        <button
          type="button"
          className={backend === 'webgpu' ? 'is-active' : ''}
          onClick={() => setBackend('webgpu')}
        >
          WebGPU
        </button>
        <span className="backend-toggle__status">
          {activeBackend === 'loading' ? 'loading' : activeBackend}
        </span>
        {engineError && <span className="backend-toggle__error">{engineError}</span>}
      </div>
      <canvas
        key={backend}
        ref={canvasRef}
        className="canvas-container"
      />
    </div>
  )
}

export default App
