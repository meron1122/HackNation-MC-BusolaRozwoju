// Wspólne komponenty makiet v2. Style: ./v2.css (ładowane tutaj, więc wystarczy import z 'src/v2').
import './v2.css'

export { Info, Source, askAssistant, ASK_ASSISTANT_EVENT, type TipAlign } from './Info'
export { AiFrame, Spark } from './AiFrame'
export {
  Segments, Ring, ScaleBar, Radar, PERIODIC_BANDS, bandOf, bandsFromLevels, type Band, type RadarSeries,
} from './charts'
export { StepHeader, StepHeaderContext, useStepHeader, type StepProgress } from './StepHeader'
export { Compass } from './Compass'
export { Warn } from './Warn'
