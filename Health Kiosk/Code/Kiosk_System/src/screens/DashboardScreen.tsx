
import type { ReactNode } from 'react'

type IconProps = { size?: number; color?: string }

function DashboardIcon({
  name,
  size = 24,
  color = 'currentColor',
}: IconProps & { name: string }) {
  const paths: Record<string, ReactNode> = {
    thermometer: <><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" /><path d="M12 11v7" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    ruler: <><path d="m21.3 8.7-6-6a2.4 2.4 0 0 0-3.4 0L2.7 12a2.4 2.4 0 0 0 0 3.4l6 6a2.4 2.4 0 0 0 3.4 0L21.3 12a2.4 2.4 0 0 0 0-3.3Z" /><path d="m7.5 10.5 2 2m1-5 2 2m1-5 2 2m-1 7 2 2" /></>,
    weight: <><path d="M5 7h14l2 14H3L5 7Z" /><path d="M9 7a3 3 0 0 1 6 0m-3 4v3" /></>,
    power: <><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /><path d="M12 2v10" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    wifi: <><path d="M2 9a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0" /><path d="M12 20h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></>,
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

const IconThermometer = (props: IconProps) => <DashboardIcon name="thermometer" {...props} />
const IconHeart = (props: IconProps) => <DashboardIcon name="heart" {...props} />
const IconRuler = (props: IconProps) => <DashboardIcon name="ruler" {...props} />
const IconWeight = (props: IconProps) => <DashboardIcon name="weight" {...props} />
const IconPower = (props: IconProps) => <DashboardIcon name="power" {...props} />
const IconChevronRight = (props: IconProps) => <DashboardIcon name="chevron" {...props} />
const IconActivity = (props: IconProps) => <DashboardIcon name="activity" {...props} />
const IconRefresh = (props: IconProps) => <DashboardIcon name="refresh" {...props} />
const IconWifi = (props: IconProps) => <DashboardIcon name="wifi" {...props} />
const IconCheck = (props: IconProps) => <DashboardIcon name="check" {...props} />
const IconAlertCircle = (props: IconProps) => <DashboardIcon name="alert" {...props} />

import type { KioskState } from '../hooks/useKiosk'

interface DashboardActions {
  connectDevice: () => void
  start: () => void
  calibrateWeight: () => void
  answerConfirm: (yes: boolean) => void
  finish: () => void
}

interface DashboardScreenProps {
  state: KioskState
  actions: DashboardActions
}

function displayValue(value?: string): string {
  if (
    !value ||
    value.trim() === '' ||
    ['invalid', 'unavailable', 'nan'].includes(value.toLowerCase())
  ) {
    return '--'
  }

  return value
}

function hasValue(value?: string): boolean {
  return Boolean(
    value &&
    value.trim() !== '' &&
    !['invalid', 'unavailable', 'nan'].includes(value.toLowerCase())
  )
}

export default function DashboardScreen({
  state,
  actions,
}: DashboardScreenProps) {
  const {
    screen,
    results,
    connected,
    error,
    statusLine,
    stepIndex,
  } = state

  const isMeasuring = screen === 'sensor'
  const isResults = screen === 'results'

  const progress = Math.min(
    100,
    Math.max(0, (stepIndex || 0) * 20),
  )

  const steps = [
    'Temperature',
    'Pulse / SpO₂',
    'Height',
    'Weight',
    'BMI',
  ]

  const sensors = [
    {
      key: 'TEMPERATURE',
      label: 'Body Temperature',
      unit: '°C',
      icon: <IconThermometer size={25} />,
      color: '#ea580c',
      background: '#fff7ed',
    },
    {
      key: 'CORRECTED_BPM',
      label: 'Pulse Rate',
      unit: 'BPM',
      icon: <IconHeart size={25} />,
      color: '#dc2626',
      background: '#fef2f2',
    },
    {
      key: 'SPO2',
      label: 'Blood Oxygen',
      unit: '%',
      icon: <IconActivity size={25} />,
      color: '#2563eb',
      background: '#eff6ff',
    },
    {
      key: 'HEIGHT',
      label: 'Height',
      unit: 'cm',
      icon: <IconRuler size={25} />,
      color: '#15803d',
      background: '#f0fdf4',
    },
    {
      key: 'WEIGHT',
      label: 'Weight',
      unit: 'kg',
      icon: <IconWeight size={25} />,
      color: '#0f766e',
      background: '#f0fdfa',
    },
    {
      key: 'BMI',
      label: 'Body Mass Index',
      unit: 'kg/m²',
      icon: <IconActivity size={25} />,
      color: '#9333ea',
      background: '#faf5ff',
    },
  ]

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 'clamp(14px, 3vw, 32px)',
        background: '#f4f7fb',
        color: '#172033',
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        .vs-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 44px;
          padding: 11px 16px;
          border: 1px solid transparent;
          border-radius: 11px;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          transition: background 150ms ease, transform 150ms ease;
        }
        .vs-button:disabled {
          cursor: not-allowed;
          opacity: .48;
        }
        .vs-button:active:not(:disabled) {
          transform: scale(.98);
        }
        .vs-primary {
          color: white;
          background: #dc2626;
        }
        .vs-primary:hover:not(:disabled) {
          background: #b91c1c;
        }
        .vs-secondary {
          color: #334155;
          background: white;
          border-color: #dbe3ee;
        }
        .vs-secondary:hover:not(:disabled) {
          background: #f8fafc;
        }
        .vs-danger {
          color: #b91c1c;
          background: white;
          border-color: #fecaca;
        }
        .vs-danger:hover:not(:disabled) {
          background: #fef2f2;
        }
        .vs-sensor-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 20px;
        }
        .vs-sensor-card {
          min-width: 0;
          padding: 20px;
          border: 1px solid #e5eaf2;
          border-radius: 16px;
          background: white;
        }
        .vs-step-list {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-top: 20px;
        }
        .vs-step {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 12px;
        }
        .vs-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 25px;
        }
        @media (max-width: 800px) {
          .vs-sensor-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .vs-step-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .vs-sensor-grid {
            grid-template-columns: 1fr;
          }
          .vs-actions {
            flex-direction: column;
          }
          .vs-actions .vs-button {
            width: 100%;
          }
          .vs-step-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 18,
          marginBottom: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#dc2626',
              color: 'white',
            }}
          >
            <IconActivity size={28} />
          </div>

          <div>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800 }}>
              VitaScan
            </h1>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 14 }}>
              Health Monitoring Kiosk
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 14px',
            border: '1px solid #e2e8f0',
            borderRadius: 999,
            background: 'white',
            color: connected ? '#15803d' : '#64748b',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: connected ? '#16a34a' : '#94a3b8',
            }}
          />
          {connected ? 'Arduino Connected' : 'Device Disconnected'}
        </div>
      </header>

      {/* Welcome banner */}
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 22,
          padding: 28,
          border: '1px solid #e7ecf3',
          borderRadius: 20,
          background: 'white',
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 8px',
              color: '#dc2626',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.4,
            }}
          >
            SENSOR DASHBOARD
          </p>

          <h2 style={{ margin: 0, fontSize: 'clamp(24px, 3vw, 34px)' }}>
            {isResults
              ? 'Measurement Results'
              : isMeasuring
                ? 'Measuring Vital Signs'
                : 'Ready to Measure'}
          </h2>

          <p
            style={{
              margin: '8px 0 0',
              color: '#64748b',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {isResults
              ? 'Review the readings collected by your sensors.'
              : isMeasuring
                ? 'Follow the sensor instructions and keep still.'
                : 'Connect your Arduino to begin sensor measurements.'}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            width: 70,
            height: 70,
            borderRadius: 18,
            color: '#dc2626',
            background: '#fef2f2',
          }}
        >
          <IconActivity size={38} />
        </div>
      </section>

      {/* Error */}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 18,
            padding: 14,
            border: '1px solid #fecaca',
            borderRadius: 12,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 14,
          }}
        >
          <IconAlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Device connection */}
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 18,
          marginBottom: 22,
          padding: 22,
          border: '1px solid #e7ecf3',
          borderRadius: 18,
          background: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#eff6ff',
              color: '#2563eb',
            }}
          >
            <IconWifi size={24} />
          </div>

          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              Arduino Mega 2560
            </h3>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>
              {connected
                ? 'Serial connection is active'
                : 'Connect the Arduino using USB'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="vs-button vs-secondary"
          onClick={actions.connectDevice}
          disabled={connected || isMeasuring}
        >
          <IconWifi size={18} />
          {connected ? 'Connected' : 'Connect Device'}
        </button>
      </section>

      {/* Sensor cards */}
      <section
        style={{
          marginBottom: 22,
          padding: 22,
          border: '1px solid #e7ecf3',
          borderRadius: 18,
          background: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Sensor Readings</h3>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>
              Live measurements from connected sensors
            </p>
          </div>

          {isMeasuring && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                color: '#15803d',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#16a34a',
                }}
              />
              Measuring
            </span>
          )}
        </div>

        <div className="vs-sensor-grid">
          {sensors.map((sensor) => {
            const value =
              results[sensor.key as keyof typeof results]

            return (
              <article className="vs-sensor-card" key={sensor.key}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      background: sensor.background,
                      color: sensor.color,
                    }}
                  >
                    {sensor.icon}
                  </div>

                  {hasValue(value) && (
                    <span style={{ color: '#15803d' }}>
                      <IconCheck size={18} />
                    </span>
                  )}
                </div>

                <p
                  style={{
                    margin: 0,
                    color: '#64748b',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {sensor.label}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <strong
                    style={{
                      fontSize: 'clamp(25px, 3vw, 34px)',
                      fontWeight: 800,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {displayValue(value)}
                  </strong>

                  <span style={{ color: '#64748b', fontSize: 13 }}>
                    {sensor.unit}
                  </span>
                </div>
              </article>
            )
          })}
        </div>

        {/* BMI category */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 16,
            padding: 18,
            borderRadius: 14,
            background: '#f8fafc',
          }}
        >
          <div>
            <p
              style={{
                margin: '0 0 6px',
                color: '#64748b',
                fontSize: 12,
              }}
            >
              BMI Category
            </p>
            <strong>{results.BMI_CATEGORY || 'Waiting for measurement'}</strong>
          </div>
          <IconActivity size={24} color="#9333ea" />
        </div>
      </section>

      {/* Progress */}
      <section
        style={{
          marginBottom: 22,
          padding: 22,
          border: '1px solid #e7ecf3',
          borderRadius: 18,
          background: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              Measurement Progress
            </h3>
            <p
              style={{
                margin: '5px 0 0',
                color: '#64748b',
                fontSize: 13,
              }}
            >
              {statusLine || 'Waiting for the Arduino'}
            </p>
          </div>

          <strong style={{ color: '#dc2626' }}>
            {Math.min(Math.max(stepIndex || 0, 0), 5)} / 5
          </strong>
        </div>

        <div
          style={{
            height: 8,
            overflow: 'hidden',
            marginTop: 20,
            borderRadius: 999,
            background: '#e2e8f0',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 999,
              background: '#dc2626',
              transition: 'width 250ms ease',
            }}
          />
        </div>

        <div className="vs-step-list">
          {steps.map((step, index) => {
            const complete = (stepIndex || 0) > index
            const active =
              (stepIndex || 0) === index && isMeasuring

            return (
              <div className="vs-step" key={step}>
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    width: 27,
                    height: 27,
                    borderRadius: '50%',
                    background: complete
                      ? '#dcfce7'
                      : active
                        ? '#dc2626'
                        : '#e2e8f0',
                    color: complete
                      ? '#15803d'
                      : active
                        ? 'white'
                        : '#475569',
                    fontWeight: 750,
                  }}
                >
                  {complete ? <IconCheck size={15} /> : index + 1}
                </span>
                {step}
              </div>
            )
          })}
        </div>
      </section>

      {/* Actions */}
      <section className="vs-actions">
        <button
          type="button"
          className="vs-button vs-primary"
          onClick={actions.start}
          disabled={!connected || isMeasuring}
          style={{ minHeight: 50, padding: '13px 20px' }}
        >
          <IconActivity size={20} />
          {isResults ? 'Start New Measurement' : 'Start Measurement'}
          <IconChevronRight size={20} />
        </button>

        <button
          type="button"
          className="vs-button vs-secondary"
          onClick={actions.calibrateWeight}
          disabled={!connected || isMeasuring}
        >
          <IconRefresh size={18} />
          Calibrate Weight
        </button>

        <button
          type="button"
          className="vs-button vs-danger"
          onClick={actions.finish}
          disabled={!connected || (!isMeasuring && !isResults)}
        >
          <IconPower size={18} />
          End Session
        </button>
      </section>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          color: '#94a3b8',
          fontSize: 12,
        }}
      >
        <span>VitaScan Sensor System</span>
        <span>Arduino Serial · 9600 baud</span>
      </footer>
    </main>
  )
}
