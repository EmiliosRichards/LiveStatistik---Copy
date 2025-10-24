import { useEffect, useRef, useState } from 'react'

// Smooth, low-jitter auto-hide header controller using rAF throttling.
// - offset: pixels from top where header should always be shown
// - threshold: minimum accumulated scroll delta before toggling visibility
export function useAutoHideHeader(offset: number = 24, threshold: number = 24) {
  const [show, setShow] = useState(true)
  const lastY = useRef(0)
  const accum = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    lastY.current = window.pageYOffset || document.documentElement.scrollTop || 0
    const onScroll = () => {
      const y = window.pageYOffset || document.documentElement.scrollTop || 0
      const dy = y - lastY.current
      lastY.current = y
      accum.current += dy
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const currentY = lastY.current
        const delta = accum.current
        accum.current = 0
        ticking.current = false

        if (currentY <= offset) { // Always show near the top
          if (!show) setShow(true)
          return
        }
        if (delta > threshold) {
          if (show) setShow(false)
        } else if (delta < -threshold) {
          if (!show) setShow(true)
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [offset, threshold, show])

  return show
}


