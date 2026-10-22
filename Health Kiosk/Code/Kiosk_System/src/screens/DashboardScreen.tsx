import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { addRecord, todayLocal } from '../data/recordsStore'
import { computeBmi } from '../hooks/useKiosk'
import type { KioskState, KioskActions, StepKey } from '../hooks/useKiosk'
import ConnectionBar from '../components/ConnectionBar'
import LoginModal from '../components/LoginModal'
import AdminDashboard from '../components/AdminDashboard'
import {
    IconThermometer,
    IconHeart,
    IconOxygen,
    IconRuler,
    IconWeight,
    IconPerson,
    IconCalendar,
    IconGender,
    IconPower,
    IconCheck,
} from '../components/icons'
import logo from '../assets/VITASCAN LOGO.jpg'
import './dashboard-extras.css'

interface Props {
    state: KioskState
    actions: KioskActions
}

const VITALS: ReadonlyArray<{
    key: StepKey
    label: string
    unit: string
    decimals: number
    colorClass: string
    icon: JSX.Element
}> = [
        {
            key: 'TEMPERATURE',
            label: 'Temperature',
            unit: ' °C',
            decimals: 1,
            colorClass: 'v-temp',
            icon: <IconThermometer />,
        },
        {
            key: 'PULSE',
            label: 'Pulse rate',
            unit: ' bpm',
            decimals: 0,
            colorClass: 'v-pulse',
            icon: <IconHeart />,
        },
        {
            key: 'OXYGEN',
            label: 'Oxygen',
            unit: ' %',
            decimals: 0,
            colorClass: 'v-oxygen',
            icon: <IconOxygen />,
        },
        {
            key: 'HEIGHT',
            label: 'Height',
            unit: ' cm',
            decimals: 1,
            colorClass: 'v-height',
            icon: <IconRuler />,
        },
        {
            key: 'WEIGHT',
            label: 'Weight',
            unit: ' kg',
            decimals: 2,
            colorClass: 'v-weight',
            icon: <IconWeight />,
        },
    ]

const WAIT_HINTS: Record<number, string> = {
    3: 'Stand straight under the height sensor, then press Measure.',
    4: 'Step onto the platform and stand still, then press Measure.',
}

const ACTIVE_HINTS: Record<number, string> = {
    0: 'Aim the thermometer at the forehead.',
    1: 'Place your finger on the pulse sensor and keep it still.',
    2: 'Keep your finger on the sensor.',
}

export default function DashboardScreen({ state, actions }: Props) {
    const {
        phase,
        stepIndex,
        results,
        accepted,
        connected,
        error,
        statusLine,
        warnings,
    } = state

    // ---- Patient details (manual entry) ----
    const [name, setName] = useState('')
    const [age, setAge] = useState('')
    const [gender, setGender] = useState<'' | 'M' | 'F'>('')

    const ageNum = Number(age)
    const identityValid =
        name.trim().length > 0 &&
        Number.isFinite(ageNum) &&
        ageNum >= 1 &&
        ageNum <= 120 &&
        gender !== ''

    const identityLocked = !(phase === 'idle' || phase === 'booting')
    const canStart =
        connected &&
        (phase === 'idle' || phase === 'booting') &&
        identityValid

    // ---- Login / Admin ----
    const [isLoginOpen, setIsLoginOpen] = useState(false)
    const [loggedInUser, setLoggedInUser] = useState<string | null>(null)
    const [isAdminOpen, setIsAdminOpen] = useState(false)

    const handleLogin = (username: string) => {
        setLoggedInUser(username)
        setIsLoginOpen(false)
        setIsAdminOpen(true)
    }

    const handleLogout = () => {
        setLoggedInUser(null)
        setIsAdminOpen(false)
    }

    // ---- Derived ----
    const doneCount = accepted.filter(Boolean).length
    const progressPct = (doneCount / VITALS.length) * 100
    const sessionActive = phase !== 'idle' && phase !== 'booting'
    const bmi = useMemo(
        () => computeBmi(results.HEIGHT, results.WEIGHT),
        [results.HEIGHT, results.WEIGHT],
    )

    // ---- Results popup ----
    const [showResults, setShowResults] = useState(false)
    useEffect(() => {
        if (phase === 'complete') setShowResults(true)
        else setShowResults(false)
    }, [phase])
    // ---- Save finished check-up to the records table (once per patient) ----
    const savedRef = useRef(false)
    useEffect(() => {
        if (phase !== 'complete') {
            savedRef.current = false
            return
        }
        if (savedRef.current) return
        savedRef.current = true

        const val = (i: number) => {
            const v = results[VITALS[i].key]
            return typeof v === 'number' ? v.toFixed(VITALS[i].decimals) : ''
        }

        addRecord({
            name: name.trim(),
            age,
            gender: gender === 'F' ? 'F' : 'M',
            temperature: val(0),
            pulse: val(1),
            oxygen: val(2),
            height: val(3),
            weight: val(4),
            date: todayLocal(),
        })
    }, [phase, name, age, gender, results])

    const bmiClass = bmi
        ? `bmi-${bmi.category.toLowerCase().replace(/[^a-z]+/g, '-')}`
        : ''

    const fmt = (i: number) => {
        const v = results[VITALS[i].key]
        if (v === undefined) return null
        if (v === null) return 'No reading'
        return `${v.toFixed(VITALS[i].decimals)}${VITALS[i].unit}`
    }

    const startNewPatient = () => {
        setName('')
        setAge('')
        setGender('')
        actions.newSession()
    }

    const currentResult =
        stepIndex >= 0 ? results[VITALS[stepIndex]?.key] : undefined

    return (
        <div className="dashboard">
            <header className="dashboard-topbar">
                <div className="topbar-brand">
                    <img src={logo} alt="" className="topbar-logo" />
                    <div>
                        <div className="topbar-title">VitaScan</div>
                        <div className="topbar-sub">
                            Vital signs &amp; BMI kiosk
                        </div>
                    </div>
                </div>

                <div className="topbar-actions">
                    <ConnectionBar
                        connected={connected}
                        error={error}
                        onConnect={actions.connectDevice}
                    />

                    <button
                        type="button"
                        className="login-btn"
                        onClick={() =>
                            loggedInUser
                                ? setIsAdminOpen(true)
                                : setIsLoginOpen(true)
                        }
                    >
                        <IconPerson className="icon-sm" />
                        {loggedInUser
                            ? `${loggedInUser} · Records`
                            : 'Staff login'}
                    </button>
                </div>
            </header>

            <div className="dashboard-body">
                {/* ---------- Patient card ---------- */}
                <section className="identity-card">
                    <h3 className="card-heading">Patient</h3>

                    <div className="identity-avatar">
                        <IconPerson className="icon-lg" />
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            <IconPerson className="icon-sm" />
                            Name
                        </label>
                        <input
                            className="field-input"
                            value={name}
                            disabled={identityLocked}
                            onChange={e => setName(e.target.value)}
                            placeholder="Enter name"
                        />
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            <IconCalendar className="icon-sm" />
                            Age
                        </label>
                        <input
                            className="field-input"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={120}
                            value={age}
                            disabled={identityLocked}
                            onChange={e => setAge(e.target.value)}
                            placeholder="Enter age"
                        />
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            <IconGender className="icon-sm" />
                            Gender
                        </label>
                        <select
                            className="field-input"
                            value={gender}
                            disabled={identityLocked}
                            onChange={e =>
                                setGender(e.target.value as 'M' | 'F')
                            }
                        >
                            <option value="" disabled>
                                Select gender
                            </option>
                            <option value="M">Male</option>
                            <option value="F">Female</option>
                        </select>
                    </div>

                    {(phase === 'idle' || phase === 'booting') && (
                        <button
                            type="button"
                            className="btn btn-primary btn-start"
                            disabled={!canStart}
                            onClick={actions.start}
                        >
                            Start measurement
                        </button>
                    )}

                    {phase === 'idle' && !canStart && (
                        <p className="status-line">
                            {!connected
                                ? 'Tap Connect above to begin.'
                                : 'Enter name, age and gender to start.'}
                        </p>
                    )}

                    {phase === 'booting' && connected && (
                        <p className="status-line">
                            {statusLine ||
                                'Device starting. Keep the platform empty…'}
                        </p>
                    )}

                    {/* Zero scale (moved here from the removed serial panel) */}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={actions.tare}
                        disabled={
                            !connected ||
                            !(phase === 'idle' || phase === 'complete')
                        }
                    >
                        <IconWeight className="icon-sm" />
                        Zero scale
                    </button>

                    {warnings.length > 0 && (
                        <ul className="warn-list">
                            {warnings.map((w, i) => (
                                <li key={i} className="warn-text">
                                    {w}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* ---------- Vitals card ---------- */}
                <section className="vitals-card">
                    <div className="vitals-head">
                        <h3 className="card-heading">Vital signs</h3>
                        <span className="vitals-count">
                            {doneCount} of {VITALS.length} complete
                        </span>
                    </div>

                    <div className="vitals-progress" aria-hidden="true">
                        <span style={{ width: `${progressPct}%` }} />
                    </div>

                    <div className="vitals-list">
                        {VITALS.map((v, i) => {
                            const isDone = accepted[i]
                            const isActive =
                                sessionActive &&
                                phase !== 'complete' &&
                                i === stepIndex
                            const status = isDone
                                ? 'Done'
                                : isActive
                                    ? 'In progress'
                                    : 'Waiting'
                            const value = fmt(i)

                            return (
                                <div
                                    key={v.key}
                                    className={`vitals-row ${v.colorClass} ${isActive ? 'active' : ''
                                        } ${isDone ? 'done' : ''}`}
                                >
                                    <span className="vitals-icon">
                                        {isDone ? <IconCheck /> : v.icon}
                                    </span>
                                    <span className="vitals-label">
                                        {v.label}
                                    </span>
                                    {value && (
                                        <span className="vitals-value">
                                            {value}
                                        </span>
                                    )}
                                    <span className="vitals-status">
                                        {status}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* ---------- Active step panel ---------- */}
                    {(phase === 'running' ||
                        phase === 'waitDone' ||
                        phase === 'confirm') && (
                            <div className="active-step-panel">
                                {phase === 'running' && (
                                    <p className="status-line">
                                        {statusLine ||
                                            ACTIVE_HINTS[stepIndex] ||
                                            'Measuring…'}
                                    </p>
                                )}

                                {phase === 'waitDone' && (
                                    <div className="inline-prompt">
                                        <p>
                                            {WAIT_HINTS[stepIndex] ??
                                                'Press Measure when ready.'}
                                        </p>
                                        <div className="btn-row">
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={actions.measure}
                                            >
                                                Measure
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {phase === 'confirm' && (
                                    <div className="inline-prompt">
                                        {currentResult == null ? (
                                            <p className="warn-text">
                                                {statusLine ||
                                                    'No valid reading was captured.'}
                                            </p>
                                        ) : (
                                            <p className="ok-text">
                                                Reading captured:{' '}
                                                <strong>
                                                    {fmt(stepIndex)}
                                                </strong>
                                            </p>
                                        )}
                                        <div className="btn-row">
                                            {currentResult != null &&
                                                !accepted[stepIndex] && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={actions.accept}
                                                    >
                                                        Accept (N)
                                                    </button>
                                                )}
                                            {currentResult != null &&
                                                accepted[stepIndex] &&
                                                stepIndex <
                                                VITALS.length - 1 && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={actions.next}
                                                    >
                                                        Next
                                                    </button>
                                                )}
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={actions.retake}
                                            >
                                                Retry (Y)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    {/* ---------- Complete: compact actions ---------- */}
                    {phase === 'complete' && (
                        <div className="results-panel">
                            <div className="btn-row">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => setShowResults(true)}
                                >
                                    View results
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={startNewPatient}
                                >
                                    <IconPower className="icon-sm" />
                                    End session / New patient
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* ---------- Results popup ---------- */}
            {phase === 'complete' && showResults && (
                <div
                    className="results-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Measurement results"
                    onClick={() => setShowResults(false)}
                >
                    <div
                        className="results-modal"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="results-close"
                            aria-label="Close"
                            onClick={() => setShowResults(false)}
                        >
                            ×
                        </button>

                        <h3 className="results-modal-title">
                            {name.trim() || 'Patient'}
                            {age ? ` · ${age} yrs` : ''}
                            {gender
                                ? ` · ${gender === 'M' ? 'Male' : 'Female'}`
                                : ''}
                        </h3>

                        <div className={`bmi-hero ${bmiClass}`}>
                            <span className="bmi-hero-label">Your BMI</span>
                            <span className="bmi-hero-value">
                                {bmi ? bmi.bmi.toFixed(1) : '—'}
                            </span>
                            <span className="bmi-hero-category">
                                {bmi
                                    ? bmi.category
                                    : 'Height or weight unavailable'}
                            </span>
                            {bmi && ageNum > 0 && ageNum < 20 && (
                                <span className="bmi-note">
                                    Adult cut-offs shown. For under 20,
                                    BMI-for-age applies.
                                </span>
                            )}
                        </div>

                        <div className="results-grid">
                            {VITALS.map((v, i) => (
                                <div key={v.key} className="result-item">
                                    <span className="result-label">
                                        {v.label}
                                    </span>
                                    <span className="result-value">
                                        {fmt(i) ?? '—'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="btn-row results-modal-actions">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowResults(false)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={startNewPatient}
                            >
                                <IconPower className="icon-sm" />
                                End session / New patient
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <LoginModal
                open={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
                onLogin={handleLogin}
            />

            {isAdminOpen && (
                <AdminDashboard
                    onClose={() => setIsAdminOpen(false)}
                    onLogout={handleLogout}
                />
            )}
        </div>
    )
}