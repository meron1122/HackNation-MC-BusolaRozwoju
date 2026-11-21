import { useRef, type PointerEvent } from 'react'

/** Pole do złożenia podpisu myszką/palcem. onChange dostaje PNG jako data URL albo null (puste). */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) * e.currentTarget.width) / rect.width, y: ((e.clientY - rect.top) * e.currentTarget.height) / rect.height }
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d')!
    const { x, y } = point(e)
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c1f24'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const { x, y } = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvas.current!.toDataURL('image/png'))
  }

  function clear() {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    onChange(null)
  }

  return (
    <div className="signature-pad">
      <canvas ref={canvas} width={480} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        aria-label="Pole podpisu" />
      <button type="button" className="link" onClick={clear}>Wyczyść</button>
    </div>
  )
}
