import logo from '../assets/VITASCAN LOGO.jpg'

interface Props {
  onNext: () => void
}

export default function SplashScreen({ onNext }: Props) {
  return (
    <div className="screen splash-screen">
      <img src={logo} alt="VitaScan" className="splash-logo" />
      <h1 className="splash-title">VitaScan</h1>
      <p className="splash-subtitle">Vital Signs &amp; BMI Kiosk</p>

      <button type="button" className="btn btn-primary btn-xl" onClick={onNext}>
        Get Started
      </button>

    </div>
  )
}