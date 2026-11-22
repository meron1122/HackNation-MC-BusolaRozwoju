import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { Icon } from './Icon'

/** rrrr-mm-dd → dd.mm.rrrr (pusty dla braku albo złej wartości). */
const toText = (iso?: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''

/** dd.mm.rrrr (też d.m.rrrr, z „/” albo „-”, albo ddmmrrrr) → rrrr-mm-dd; null, gdy to nie jest istniejąca data. */
function parse(text: string): string | null {
  const value = text.trim()
  const m = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/) ?? value.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const canPick = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'> & {
  /** rrrr-mm-dd albo '' — jak w natywnym polu daty. */
  value?: string | null
  defaultValue?: string | null
  /** rrrr-mm-dd albo '' (wyczyszczone); niepełnego wpisu nie zgłasza. */
  onChange?: (iso: string) => void
  min?: string
  max?: string
}

/**
 * Pole daty zawsze jako dd.mm.rrrr. Natywne <input type="date"> pokazuje format z języka przeglądarki
 * (np. mm/dd/yyyy), a nie strony. Na zewnątrz wartość jak w natywnym polu (rrrr-mm-dd): przez value/onChange
 * albo — z `name` — ukrytym polem do FormData. Kalendarz to natywny wybierak (showPicker). Zły format i zakres
 * min/max blokują wysłanie formularza z komunikatem, jak w natywnym polu.
 */
export function DateInput({ value, defaultValue, onChange, name, min, max, required, disabled, ...rest }: Props) {
  const controlled = value !== undefined
  const [text, setText] = useState(() => toText(controlled ? value : defaultValue))
  const textRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  const iso = parse(text) ?? ''

  // Wartość zmieniona z zewnątrz (np. podpowiedź terminu) — pokaż ją; niepełny wpis w toku zostaje.
  useEffect(() => {
    if (controlled && (value ?? '') !== iso) setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    textRef.current?.setCustomValidity(
      text.trim() && !iso ? 'Wpisz datę jako dd.mm.rrrr.'
        : iso && min && iso < min ? `Data nie może być wcześniejsza niż ${toText(min)}.`
        : iso && max && iso > max ? `Data nie może być późniejsza niż ${toText(max)}.`
        : '')
  }, [text, iso, min, max])

  function update(next: string) {
    setText(next)
    const parsed = parse(next)
    if (parsed !== null || next.trim() === '') onChange?.(parsed ?? '')
  }

  return (
    <span className="date-input">
      <input
        {...rest}
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd.mm.rrrr"
        maxLength={10}
        value={text}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          // Kropki dopisują się same po dniu i miesiącu (tylko przy wpisywaniu, nie przy kasowaniu).
          const typing = (e.nativeEvent as InputEvent).inputType?.startsWith('insert')
          update(typing && /^(\d{2}|\d{1,2}\.\d{2})$/.test(e.target.value) ? `${e.target.value}.` : e.target.value)
        }}
        onBlur={(e) => {
          if (iso) setText(toText(iso))
          rest.onBlur?.(e)
        }}
      />
      {name && <input type="hidden" name={name} value={iso} disabled={disabled} />}
      {canPick && !disabled && (
        <>
          <button type="button" className="date-input-button" aria-label="Wybierz datę z kalendarza" title="Kalendarz"
            onClick={() => {
              try {
                pickerRef.current?.showPicker()
              } catch {
                textRef.current?.focus()
              }
            }}>
            <Icon name="calendar" />
          </button>
          {/* form="" spoza formularza: ukryty wybierak nie bierze udziału w walidacji ani w FormData. */}
          <input ref={pickerRef} type="date" className="date-input-picker" tabIndex={-1} aria-hidden="true" form="date-input-picker"
            value={iso} min={min} max={max}
            onChange={(e) => {
              update(toText(e.target.value))
              textRef.current?.focus()
            }} />
        </>
      )}
    </span>
  )
}
