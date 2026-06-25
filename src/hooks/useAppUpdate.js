import { useEffect, useState, useRef } from 'react'

export function useAppUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const waitingWorkerRef = useRef(null)
  const isUpdatingRef = useRef(false)

  const updateServiceWorker = () => {
    if (isUpdatingRef.current) return
    isUpdatingRef.current = true
    setIsUpdating(true)

    let reloaded = false
    const doReload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    setTimeout(doReload, 3000)

    const worker = waitingWorkerRef.current
    if (worker) {
      navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true })
      worker.postMessage({ type: 'SKIP_WAITING' })
    } else {
      navigator.serviceWorker.getRegistrations().then(regs => {
        const waiting = regs.find(r => r.waiting)
        if (waiting) {
          navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true })
          waiting.waiting.postMessage({ type: 'SKIP_WAITING' })
        } else {
          doReload()
        }
      })
    }
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const trackWorker = (worker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = worker
          setNeedRefresh(true)
        }
      })
    }

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = reg.waiting
        setNeedRefresh(true)
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (newWorker) trackWorker(newWorker)
      })

      reg.update().catch(() => {})
    })

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Auto-update when user switches away from the app
        if (waitingWorkerRef.current && !isUpdatingRef.current) {
          updateServiceWorker()
        }
      } else {
        navigator.serviceWorker.ready.then(r => r.update()).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return { needRefresh, updateServiceWorker, isUpdating }
}
