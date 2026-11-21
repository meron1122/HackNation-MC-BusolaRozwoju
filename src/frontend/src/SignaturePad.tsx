import { useEffect, useRef } from 'react'

const HEIGHT = 200

/**
 * Pole podpisu odręcznego: mysz, palec, rysik albo tablet graficzny (pointer events, grubość z nacisku pióra).
 * Po każdym pociągnięciu oddaje podpis jako PNG z przezroczystym tłem (data URL), po wyczyszczeniu null.
 */
export function SignaturePad({ onChange, disabled }: { onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const empty = useRef(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * ratio
    canvas.height = HEIGHT * ratio
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a2b6d'
  }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = point(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const p = point(e)
    // Mysz zgłasza nacisk 0.5, pióro realny nacisk 0–1.
    ctx.lineWidth = 1 + (e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5) * 2.5
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    empty.current = false
  }

  function up() {
    if (!last.current) return
    last.current = null
    if (!empty.current) onChange(canvasRef.current!.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    empty.current = true
    onChange(null)
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT }}
        aria-label="Pole podpisu: podpisz się myszą, palcem lub rysikiem"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="signature-line" aria-hidden="true">Podpis</div>
      <button type="button" className="secondary" onClick={clear} disabled={disabled}>Wyczyść</button>
    </div>
  )
}
