import { useEffect } from 'react'
import { AssistantChat } from './AssistantChat'
import { dock } from './store'

/** Strona „Asystent” (H13): pełna szerokość, podgląd źródła z prawej. Okno w rogu w tym czasie się chowa. */
export function AssistantPage() {
  useEffect(() => dock(), [])
  return (
    <section className="asst-pagewrap" aria-label="Asystent">
      <h1 className="sr-only">Asystent</h1>
      <AssistantChat variant="page" autoFocus />
    </section>
  )
}
