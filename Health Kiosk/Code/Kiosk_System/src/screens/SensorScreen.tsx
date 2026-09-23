import type { KioskState } from '../hooks/useKiosk'

interface Props {
  state: KioskState
  actions: { answerConfirm: (yes: boolean) => void }
}

const STEP_ORDER = ['TEMPERATURE', 'PULSE RATE', 'OXYGEN', 'HEIGHT', 'WEIGHT']
const STEP_LABEL: Record<string, string> = {
  TEMPERATURE: 'Temp',
  'PULSE RATE': 'Pulse',
  OXYGEN: 'Oxygen',
  HEIGHT: 'Height',
  WEIGHT: 'Weight',
}

export default function SensorScreen({ state, actions }: Props) {
  const { sectionTitle, promptKind, statusLine, stepIndex } = state
  const timeMatch = statusLine.match(/Time: (\d+) sec/)

  return (
    <div className="screen sensor-screen">
      <div className="sensor-progress">
        {STEP_ORDER.map((step, i) => (
          <span
            key={step}
            className={i + 1 === stepIndex ? 'active' : i + 1 < stepIndex ? 'done' : ''}
          >
            {STEP_LABEL[step]}
          </span>
        ))}
      </div>

      <h2 className="screen-title">{sectionTitle}</h2>
      <p className="sensor-step-count">Step {stepIndex} of 5</p>

      {promptKind === 'ready' && (
        <div className="prompt-card">
          <p>Ready to measure {sectionTitle.toLowerCase()}?</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => actions.answerConfirm(true)}>
              Yes
            </button>
            <button className="btn btn-ghost" onClick={() => actions.answerConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {promptKind === 'retry' && (
        <div className="prompt-card">
          <p className="warn-text">No valid reading was captured.</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => actions.answerConfirm(true)}>
              Try Again
            </button>
            <button className="btn btn-ghost" onClick={() => actions.answerConfirm(false)}>
              Skip This Step
            </button>
          </div>
        </div>
      )}

      {promptKind === 'redo' && (
        <div className="prompt-card">
          <p className="ok-text">Reading captured.</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => actions.answerConfirm(false)}>
              Accept &amp; Continue
            </button>
            <button className="btn btn-ghost" onClick={() => actions.answerConfirm(true)}>
              Redo
            </button>
          </div>
        </div>
      )}

      {!promptKind && (
        <div className="measuring-card">
          {timeMatch && <div className="measuring-timer">{timeMatch[1]}s</div>}
          <p className="status-line">{statusLine || 'Preparing sensor…'}</p>
          <div className="pulse-dot" />
        </div>
      )}
    </div>
  )
}