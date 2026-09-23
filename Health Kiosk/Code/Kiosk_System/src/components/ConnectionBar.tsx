interface Props {
  connected: boolean
  error: string | null
  onConnect: () => void
}

export default function ConnectionBar({ connected, error, onConnect }: Props) {
  return (
    <div className="connection-bar">
      <div className="connection-status">
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`} />
        <span>{connected ? 'Device Connected' : 'Device Not Connected'}</span>
      </div>

      {!connected && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onConnect}>
          Connect Device
        </button>
      )}

      {error && <span className="connection-error">{error}</span>}
    </div>
  )
}