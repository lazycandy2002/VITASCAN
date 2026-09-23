import { useEffect, useRef, useState } from 'react'
import type { KioskState } from '../hooks/useKiosk'
import ConnectionBar from '../components/ConnectionBar'

interface Props {
  state: KioskState
  actions: {
    connectDevice: () => void
    answerConfirm: (yes: boolean) => void
    submitName: (v: string) => void
    submitAge: (v: string) => void
    submitGender: (v: 'M' | 'F') => void
  }
}

export default function IdentityScreen({ state, actions }: Props) {
  const [text, setText] = useState('')
  const { sectionTitle, promptKind, identity, connected, error } = state
  const autoStarted = useRef(false)

  // If the device is already connected (e.g. starting a new check-up
  // right after finishing one), resend START automatically instead of
  // making the person click Connect again. Only fires once per visit
  // to this screen, and only when the firmware hasn't spoken yet.
  useEffect(() => {
    if (connected && !sectionTitle && !promptKind && !autoStarted.current) {
      autoStarted.current = true
      actions.connectDevice()
    }
  }, [connected, sectionTitle, promptKind, actions])

  const fieldLabel =
    sectionTitle === 'NAME'
      ? 'Name'
      : sectionTitle === 'AGE'
        ? 'Age'
        : sectionTitle === 'GENDER'
          ? 'Gender'
          : sectionTitle

  return (
    <div className="screen identity-screen">
      <ConnectionBar connected={connected} error={error} onConnect={actions.connectDevice} />

      <div className="identity-progress">
        <span className={identity.name ? 'done' : sectionTitle === 'NAME' ? 'active' : ''}>Name</span>
        <span className={identity.age ? 'done' : sectionTitle === 'AGE' ? 'active' : ''}>Age</span>
        <span className={identity.gender ? 'done' : sectionTitle === 'GENDER' ? 'active' : ''}>Gender</span>
      </div>

      <h2 className="screen-title">{fieldLabel}</h2>

      {promptKind === 'ready' && (
        <div className="prompt-card">
          <p>Ready to enter your {fieldLabel.toLowerCase()}?</p>
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

      {promptKind === 'name' && (
        <form
          className="prompt-card"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) {
              actions.submitName(text.trim())
              setText('')
            }
          }}
        >
          <input
            className="kiosk-input"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your full name"
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            Continue
          </button>
        </form>
      )}

      {promptKind === 'age' && (
        <form
          className="prompt-card"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(text)
            if (n > 0 && n <= 120) {
              actions.submitAge(text.trim())
              setText('')
            }
          }}
        >
          <input
            className="kiosk-input"
            autoFocus
            type="number"
            min={1}
            max={120}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Age in years"
          />
          <button type="submit" className="btn btn-primary" disabled={!text}>
            Continue
          </button>
        </form>
      )}

      {promptKind === 'gender' && (
        <div className="prompt-card">
          <div className="btn-row">
            <button className="btn btn-primary btn-wide" onClick={() => actions.submitGender('M')}>
              Male
            </button>
            <button className="btn btn-primary btn-wide" onClick={() => actions.submitGender('F')}>
              Female
            </button>
          </div>
        </div>
      )}

      {!promptKind && (
        <p className="status-line">
          {state.statusLine || (connected ? 'Waiting for device…' : 'Tap Connect Device above to begin.')}
        </p>
      )}
    </div>
  )
}