import { useEffect, useState } from 'react'
import type { KioskState } from '../hooks/useKiosk'
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
    IconDocument,
    IconChevronRight,
    IconCheck,
} from '../components/icons'
import logo from '../assets/VITASCAN LOGO.jpg'

interface Actions {
    connectDevice: () => void
    answerConfirm: (yes: boolean) => void
    submitName: (v: string) => void
    submitAge: (v: string) => void
    submitGender: (v: 'M' | 'F') => void
    finish: () => void
}

interface Props {
    state: KioskState
    actions: Actions
}

const VITALS = [
    { key: 'TEMPERATURE', label: 'Temperature', colorClass: 'v-temp', icon: <IconThermometer /> },
    { key: 'PULSE RATE', label: 'Pulse Rate', colorClass: 'v-pulse', icon: <IconHeart /> },
    { key: 'OXYGEN', label: 'Oxygen', colorClass: 'v-oxygen', icon: <IconOxygen /> },
    { key: 'HEIGHT', label: 'Height', colorClass: 'v-height', icon: <IconRuler /> },
    { key: 'WEIGHT', label: 'Weight', colorClass: 'v-weight', icon: <IconWeight /> },
] as const

export default function DashboardScreen({ state, actions }: Props) {
    const { screen, sectionTitle, promptKind, identity, results, stepIndex, connected, error, statusLine } = state

    // Local editable copies of identity fields
    const [nameValue, setNameValue] = useState(identity.name ?? '')
    const [ageValue, setAgeValue] = useState(identity.age ?? '')
    const [genderValue, setGenderValue] = useState(identity.gender ?? '')

    useEffect(() => setNameValue(identity.name ?? ''), [identity.name])
    useEffect(() => setAgeValue(identity.age ?? ''), [identity.age])
    useEffect(() => setGenderValue(identity.gender ?? ''), [identity.gender])

    // ---- Login / Admin dashboard state ----
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

    const activeIdentityField =
        screen === 'identity'
            ? sectionTitle === 'NAME'
                ? 'name'
                : sectionTitle === 'AGE'
                    ? 'age'
                    : sectionTitle === 'GENDER'
                        ? 'gender'
                        : null
            : null

    const resultsReady = screen === 'results' || Object.keys(results).length > 0

    return (
        <div className="dashboard">
            <div className="dashboard-topbar">
                <button
                    type="button"
                    className="login-btn"
                    onClick={() => (loggedInUser ? setIsAdminOpen(true) : setIsLoginOpen(true))}
                >
                    <IconPerson className="icon-sm" />
                    {loggedInUser ? `${loggedInUser} · Records` : 'Login'}
                </button>
                <ConnectionBar connected={connected} error={error} onConnect={actions.connectDevice} />
            </div>

            <div className="dashboard-body">
                {/* ---------- Identity card ---------- */}
                <div className="identity-card">
                    <div className="identity-avatar">
                        <IconPerson className="icon-lg" />
                    </div>

                    {promptKind === 'ready' && screen === 'identity' && (
                        <div className="inline-prompt">
                            <p>Ready to enter your {activeIdentityField}?</p>
                            <div className="btn-row">
                                <button className="btn btn-primary btn-sm" onClick={() => actions.answerConfirm(true)}>
                                    Yes
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => actions.answerConfirm(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="field-row">
                        <label className="field-label">
                            <IconPerson className="icon-sm" /> Name
                        </label>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                if (nameValue.trim()) actions.submitName(nameValue.trim())
                            }}
                        >
                            <input
                                className="field-input"
                                value={nameValue}
                                onChange={(e) => setNameValue(e.target.value)}
                                onBlur={() => {
                                    if (nameValue.trim() && nameValue.trim() !== identity.name) {
                                        actions.submitName(nameValue.trim())
                                    }
                                }}
                                placeholder="Enter name..."
                            />
                        </form>
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            <IconCalendar className="icon-sm" /> Age
                        </label>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                const n = Number(ageValue)
                                if (n > 0 && n <= 120) actions.submitAge(String(ageValue).trim())
                            }}
                        >
                            <input
                                className="field-input"
                                type="number"
                                min={1}
                                max={120}
                                value={ageValue}
                                onChange={(e) => setAgeValue(e.target.value)}
                                onBlur={() => {
                                    const n = Number(ageValue)
                                    if (n > 0 && n <= 120 && String(ageValue).trim() !== String(identity.age)) {
                                        actions.submitAge(String(ageValue).trim())
                                    }
                                }}
                                placeholder="Enter age..."
                            />
                        </form>
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            <IconGender className="icon-sm" /> Gender
                        </label>
                        <select
                            className="field-input"
                            value={genderValue}
                            onChange={(e) => {
                                const v = e.target.value
                                setGenderValue(v)
                                if (v === 'M' || v === 'F') actions.submitGender(v)
                            }}
                        >
                            <option value="" disabled>
                                Select gender...
                            </option>
                            <option value="M">Male</option>
                            <option value="F">Female</option>
                        </select>
                    </div>

                    {!promptKind && screen === 'identity' && (
                        <p className="status-line">
                            {statusLine || (connected ? 'Waiting for device…' : 'Tap Connect Device above to begin.')}
                        </p>
                    )}
                </div>

                {/* ---------- Vitals card ---------- */}
                <div className="vitals-card">
                    {VITALS.map((v, i) => {
                        const idx = i + 1
                        const isActive = screen === 'sensor' && idx === stepIndex
                        const isDone = screen === 'sensor' ? idx < stepIndex : screen === 'results'
                        return (
                            <div
                                key={v.key}
                                className={`vitals-row ${v.colorClass} ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                            >
                                <span className="vitals-icon">{isDone ? <IconCheck /> : v.icon}</span>
                                <span className="vitals-label">{v.label}</span>
                                <span className="vitals-chevron">
                                    <IconChevronRight />
                                </span>
                            </div>
                        )
                    })}

                    {screen === 'sensor' && (
                        <div className="active-step-panel">
                            {promptKind === 'ready' && (
                                <div className="inline-prompt">
                                    <p>Ready to measure {sectionTitle.toLowerCase()}?</p>
                                    <div className="btn-row">
                                        <button className="btn btn-primary btn-sm" onClick={() => actions.answerConfirm(true)}>
                                            Yes
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => actions.answerConfirm(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {promptKind === 'retry' && (
                                <div className="inline-prompt">
                                    <p className="warn-text">No valid reading was captured.</p>
                                    <div className="btn-row">
                                        <button className="btn btn-primary btn-sm" onClick={() => actions.answerConfirm(true)}>
                                            Try Again
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => actions.answerConfirm(false)}>
                                            Skip
                                        </button>
                                    </div>
                                </div>
                            )}
                            {promptKind === 'redo' && (
                                <div className="inline-prompt">
                                    <p className="ok-text">Reading captured.</p>
                                    <div className="btn-row">
                                        <button className="btn btn-primary btn-sm" onClick={() => actions.answerConfirm(false)}>
                                            Accept
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => actions.answerConfirm(true)}>
                                            Redo
                                        </button>
                                    </div>
                                </div>
                            )}
                            {!promptKind && <p className="status-line">{statusLine || 'Preparing sensor…'}</p>}
                        </div>
                    )}

                    <button type="button" className={`vitals-row action-row ${resultsReady ? 'enabled' : ''}`} disabled={!resultsReady}>
                        <span className="vitals-icon v-results">
                            <IconDocument />
                        </span>
                        <span className="vitals-label">Show all data + BMI result</span>
                        <span className="vitals-chevron">
                            <IconChevronRight />
                        </span>
                    </button>

                    <button
                        type="button"
                        className="vitals-row action-row end-row"
                        disabled={promptKind !== 'finish'}
                        onClick={actions.finish}
                    >
                        <span className="vitals-icon v-end">
                            <IconPower />
                        </span>
                        <span className="vitals-label">END</span>
                        <span className="vitals-chevron">
                            <IconChevronRight />
                        </span>
                    </button>
                </div>

                {/* ---------- Brand panel ---------- */}
                <div className="brand-panel">
                    <img src={logo} alt="VitaScan" className="brand-logo" />
                    <h2 className="brand-title">VitaScan</h2>
                    <p className="brand-subtitle">Vital Signs &amp; BMI Kiosk</p>
                    <div className="brand-figure">
                        <div className="scan-ring" />
                        <svg viewBox="0 0 120 220" className="figure-svg">
                            <circle cx="60" cy="30" r="18" />
                            <path d="M60 48c-20 0-32 14-32 34v50c0 8 6 14 14 14h4v50h10v-50h8v50h10v-50h4c8 0 14-6 14-14V82c0-20-12-34-32-34Z" />
                        </svg>
                        <span className="figure-pulse" />
                    </div>
                </div>
            </div>

            <LoginModal open={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={handleLogin} />
            {isAdminOpen && <AdminDashboard onClose={() => setIsAdminOpen(false)} onLogout={handleLogout} />}
        </div>
    )
}