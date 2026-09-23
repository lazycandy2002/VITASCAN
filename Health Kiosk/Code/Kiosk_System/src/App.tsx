import { useKiosk } from './hooks/useKiosk'
import SplashScreen from './screens/SplashScreen'
import DashboardScreen from './screens/DashboardScreen'
import './App.css'

function App() {
  const { state, actions } = useKiosk()

  return (
    <div className="kiosk">
      {state.screen === 'splash' && <SplashScreen onNext={actions.enterIdentity} />}
      {(state.screen === 'identity' ||
        state.screen === 'sensor' ||
        state.screen === 'results') && (
        <DashboardScreen state={state} actions={actions} />
      )}
    </div>
  )
}

export default App