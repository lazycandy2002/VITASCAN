import logo from '../assets/VITASCAN LOGO.jpg'

interface Props {
  onNext: () => void
}

const MEASURES = ['Temperature', 'Pulse', 'Oxygen', 'Height', 'Weight', 'BMI']

export default function SplashScreen({ onNext }: Props) {
  return (
    <div className="screen splash-screen">
      <div className="splash-card">
        <img src={logo} alt="VitaScan" className="splash-logo" />
        <h1 className="splash-title">VitaScan</h1>
        <p className="splash-subtitle">Vital Signs &amp; BMI Kiosk</p>

        <svg className="splash-ecg" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,20 90,20 105,20 115,5 128,35 140,12 150,20 300,20" />
        </svg>

        <div className="splash-chips">
          {MEASURES.map((m) => (
            <span key={m} className="splash-chip">
              {m}
            </span>
          ))}
        </div>

        <button type="button" className="btn btn-primary btn-xl" onClick={onNext}>
          Get Started
        </button>
        <p className="splash-hint">Takes about a minute</p>
      </div>
    </div>
  )
}