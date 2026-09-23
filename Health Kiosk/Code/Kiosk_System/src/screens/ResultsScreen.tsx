import type { KioskState } from '../hooks/useKiosk'

interface Props {
  state: KioskState
  actions: { finish: () => void }
}

const ROWS: Array<[string, string]> = [
  ['NAME', 'Name'],
  ['AGE', 'Age'],
  ['GENDER', 'Gender'],
  ['TEMPERATURE', 'Temperature'],
  ['CORRECTED_BPM', 'Pulse Rate'],
  ['SPO2', 'Oxygen (SpO2)'],
  ['HEIGHT', 'Height'],
  ['WEIGHT', 'Weight'],
  ['BMI', 'BMI'],
  ['BMI_CATEGORY', 'BMI Category'],
]

export default function ResultsScreen({ state, actions }: Props) {
  const { results, promptKind } = state

  return (
    <div className="screen results-screen">
      <h2 className="screen-title">Your Results</h2>

      <div className="results-grid">
        {ROWS.map(([key, label]) => (
          <div key={key} className="results-row">
            <span className="results-label">{label}</span>
            <span className={`results-value ${results[key] === 'INVALID' ? 'invalid' : ''}`}>
              {results[key] ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {promptKind === 'finish' ? (
        <button className="btn btn-primary btn-xl" onClick={actions.finish}>
          Finish
        </button>
      ) : (
        <p className="status-line">Finalizing…</p>
      )}
    </div>
  )
}