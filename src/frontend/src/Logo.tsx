// Logo w public/logo: wygenerowane skryptem z paczki marki (busola-brand/zrodla/logo.py) z drugim wierszem
// „Rozwoju” zamiast „Kompetencji”; znak i „Busola” są identyczne z paczką. Logotypu nie składamy fontem.
// Aplikacja ma zawsze jasne tło (ciepła biel), więc tylko wersja podstawowa „jasny”; wersja na granat jest w paczce marki.
const LAYOUTS = {
  // Brandbook: poziomy od 120 px szerokości, pionowy od 80 px.
  horizontal: { file: 'poziomy', ratio: 1024 / 2372, minWidth: 120 },
  vertical: { file: 'pionowy', ratio: 1752 / 1228, minWidth: 80 },
}

export function Logo({ layout = 'horizontal', width }: { layout?: keyof typeof LAYOUTS; width: number }) {
  const { file, ratio, minWidth } = LAYOUTS[layout]
  const w = Math.max(width, minWidth)
  return (
    <span className="logo">
      <img src={`/logo/busola-${file}-jasny.svg`} alt="Busola Rozwoju" width={w} height={Math.round(w * ratio)} />
    </span>
  )
}
