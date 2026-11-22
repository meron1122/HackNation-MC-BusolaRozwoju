// Logo w public/logo: wygenerowane skryptem z paczki marki (busola-brand/zrodla/logo.py) z drugim wierszem
// „Rozwoju” zamiast „Kompetencji”; znak i „Busola” są identyczne z paczką. Logotypu nie składamy fontem.
// W trybie ciemnym tło aplikacji jest granatowe, więc podmieniamy na wersję „na granacie”.
const LAYOUTS = {
  // Brandbook: poziomy od 120 px szerokości, pionowy od 80 px.
  horizontal: { file: 'poziomy', ratio: 1024 / 2372, minWidth: 120 },
  vertical: { file: 'pionowy', ratio: 1752 / 1228, minWidth: 80 },
}

export function Logo({ layout = 'horizontal', width }: { layout?: keyof typeof LAYOUTS; width: number }) {
  const { file, ratio, minWidth } = LAYOUTS[layout]
  const w = Math.max(width, minWidth)
  return (
    <picture className="logo">
      <source srcSet={`/logo/busola-${file}-ciemny.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/logo/busola-${file}-jasny.svg`} alt="Busola Rozwoju" width={w} height={Math.round(w * ratio)} />
    </picture>
  )
}
