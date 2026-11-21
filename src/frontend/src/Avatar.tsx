import { useEffect, useState } from 'react'
import { apiBlobUrl } from './api'

type Props = {
  /** Ścieżka API do obrazka; null = wiadomo, że zdjęcia nie ma (inicjały bez zapytania). */
  path: string | null
  name: string
  size?: number
  /** Zmiana wymusza ponowne pobranie (po wgraniu nowego zdjęcia). */
  version?: number
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')

export function Avatar({ path, name, size = 32, version = 0 }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let active = true
    let created: string | null = null
    apiBlobUrl(path).then(
      (blobUrl) => {
        created = blobUrl
        if (active) setUrl(blobUrl)
        else if (blobUrl) URL.revokeObjectURL(blobUrl)
      },
      () => active && setUrl(null),
    )
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, version])

  const style = { width: size, height: size, fontSize: size * 0.4 }
  const shown = path ? url : null
  return shown ? (
    <img className="avatar" src={shown} alt={name} style={style} />
  ) : (
    <span className="avatar initials" role="img" aria-label={name} style={style}>{initials(name)}</span>
  )
}
