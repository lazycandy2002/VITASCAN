import { useState } from 'react'
import { IconCheck } from './icons'

export interface PatientRecord {
    id: string
    name: string
    age: string
    gender: 'M' | 'F'
    temperature: string
    pulse: string
    oxygen: string
    height: string
    weight: string
    date: string
}

const SAMPLE_DATA: PatientRecord[] = [
    {
        id: crypto.randomUUID(),
        name: 'Juan Dela Cruz',
        age: '34',
        gender: 'M',
        temperature: '36.7',
        pulse: '78',
        oxygen: '98',
        height: '170',
        weight: '68',
        date: '2026-09-18',
    },
    {
        id: crypto.randomUUID(),
        name: 'Maria Santos',
        age: '27',
        gender: 'F',
        temperature: '36.9',
        pulse: '82',
        oxygen: '99',
        height: '160',
        weight: '55',
        date: '2026-09-19',
    },
    {
        id: crypto.randomUUID(),
        name: 'Pedro Reyes',
        age: '45',
        gender: 'M',
        temperature: '37.2',
        pulse: '90',
        oxygen: '96',
        height: '165',
        weight: '80',
        date: '2026-09-20',
    },
    {
        id: crypto.randomUUID(),
        name: 'Ana Villanueva',
        age: '19',
        gender: 'F',
        temperature: '36.5',
        pulse: '75',
        oxygen: '99',
        height: '158',
        weight: '50',
        date: '2026-09-21',
    },
]

const emptyForm: Omit<PatientRecord, 'id'> = {
    name: '',
    age: '',
    gender: 'M',
    temperature: '',
    pulse: '',
    oxygen: '',
    height: '',
    weight: '',
    date: new Date().toISOString().slice(0, 10),
}

interface Props {
    onClose: () => void
    onLogout?: () => void
}

// height in cm, weight in kg -> BMI + category
function computeBMI(heightCm: string, weightKg: string): { value: string; category: string } | null {
    const h = Number(heightCm)
    const w = Number(weightKg)
    if (!h || !w || h <= 0 || w <= 0) return null

    const hMeters = h / 100
    const bmi = w / (hMeters * hMeters)

    let category = 'Normal'
    if (bmi < 18.5) category = 'Underweight'
    else if (bmi < 25) category = 'Normal'
    else if (bmi < 30) category = 'Overweight'
    else category = 'Obese'

    return { value: bmi.toFixed(1), category }
}

export default function AdminDashboard({ onClose, onLogout }: Props) {
    const [records, setRecords] = useState<PatientRecord[]>(SAMPLE_DATA)
    const [form, setForm] = useState<Omit<PatientRecord, 'id'>>(emptyForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)

    const startCreate = () => {
        setForm(emptyForm)
        setEditingId(null)
        setShowForm(true)
    }

    const startEdit = (r: PatientRecord) => {
        const { id, ...rest } = r
        setForm(rest)
        setEditingId(id)
        setShowForm(true)
    }

    const remove = (id: string) => {
        if (confirm('Delete this record?')) {
            setRecords((prev) => prev.filter((r) => r.id !== id))
        }
    }

    const save = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) return

        if (editingId) {
            setRecords((prev) =>
                prev.map((r) => (r.id === editingId ? { ...form, id: editingId } : r))
            )
        } else {
            setRecords((prev) => [...prev, { ...form, id: crypto.randomUUID() }])
        }
        setShowForm(false)
        setEditingId(null)
    }

    const field = (key: keyof Omit<PatientRecord, 'id'>) => ({
        value: form[key],
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value })),
    })

    const cellStyle: React.CSSProperties = {
        flex: '0 0 100px',
        padding: '0 6px',
        whiteSpace: 'nowrap',
    }

    return (
        <div className="login-overlay" role="dialog" aria-modal="true">
            <div className="login-card" style={{ width: 'min(1400px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
                <button type="button" className="login-close" onClick={onClose} aria-label="Close">
                    ✕
                </button>

                <h2 className="login-title" style={{ alignSelf: 'flex-start' }}>
                    Patient Records
                </h2>
                <p className="login-subtitle" style={{ alignSelf: 'flex-start', textAlign: 'left' }}>
                    Manage stored check-up records — full vitals + BMI
                </p>

                <div className="btn-row" style={{ alignSelf: 'flex-end', marginBottom: 12, gap: 8 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                        + Add Record
                    </button>
                    {onLogout && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                onLogout()
                                onClose()
                            }}
                        >
                            Logout
                        </button>
                    )}
                </div>

                {showForm && (
                    <form
                        onSubmit={save}
                        className="prompt-card"
                        style={{ width: '100%', marginBottom: 16, alignItems: 'stretch' }}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="field-row">
                                <label className="field-label">Name</label>
                                <input className="field-input" {...field('name')} required />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Age</label>
                                <input className="field-input" {...field('age')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Gender</label>
                                <select className="field-input" {...field('gender')}>
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                </select>
                            </div>
                            <div className="field-row">
                                <label className="field-label">Date</label>
                                <input className="field-input" type="date" {...field('date')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Temperature (°C)</label>
                                <input className="field-input" {...field('temperature')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Pulse Rate (bpm)</label>
                                <input className="field-input" {...field('pulse')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Oxygen (%)</label>
                                <input className="field-input" {...field('oxygen')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Height (cm)</label>
                                <input className="field-input" {...field('height')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Weight (kg)</label>
                                <input className="field-input" {...field('weight')} />
                            </div>
                        </div>

                        <div className="btn-row login-btn-row" style={{ marginTop: 8 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowForm(false)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary btn-sm">
                                <IconCheck className="icon-sm" /> {editingId ? 'Save Changes' : 'Add Record'}
                            </button>
                        </div>
                    </form>
                )}

                <div style={{ width: '100%', overflowX: 'auto' }}>
                    <div className="results-grid" style={{ width: '100%', minWidth: 1000 }}>
                        <div className="results-row" style={{ fontWeight: 700, color: 'var(--vs-text-dim)' }}>
                            <span style={{ ...cellStyle, flex: '0 0 150px' }}>Name</span>
                            <span style={cellStyle}>Age/Gender</span>
                            <span style={cellStyle}>Temperature</span>
                            <span style={cellStyle}>Pulse Rate</span>
                            <span style={cellStyle}>Oxygen</span>
                            <span style={cellStyle}>Height</span>
                            <span style={cellStyle}>Weight</span>
                            <span style={{ ...cellStyle, flex: '0 0 130px' }}>BMI Result</span>
                            <span style={cellStyle}>Date</span>
                            <span style={{ ...cellStyle, flex: '0 0 140px' }}>Actions</span>
                        </div>

                        {records.length === 0 && (
                            <div className="results-row">
                                <span className="results-label">No records yet.</span>
                            </div>
                        )}

                        {records.map((r) => {
                            const bmi = computeBMI(r.height, r.weight)
                            return (
                                <div className="results-row" key={r.id}>
                                    <span style={{ ...cellStyle, flex: '0 0 150px', fontWeight: 600 }}>{r.name}</span>
                                    <span style={cellStyle}>
                                        {r.age} / {r.gender}
                                    </span>
                                    <span style={cellStyle}>{r.temperature}°C</span>
                                    <span style={cellStyle}>{r.pulse} bpm</span>
                                    <span style={cellStyle}>{r.oxygen}%</span>
                                    <span style={cellStyle}>{r.height} cm</span>
                                    <span style={cellStyle}>{r.weight} kg</span>
                                    <span style={{ ...cellStyle, flex: '0 0 130px' }}>
                                        {bmi ? (
                                            <>
                                                <strong>{bmi.value}</strong>{' '}
                                                <span
                                                    className={
                                                        bmi.category === 'Normal'
                                                            ? 'ok-text'
                                                            : bmi.category === 'Underweight'
                                                                ? 'warn-text'
                                                                : 'error-text'
                                                    }
                                                    style={{ fontSize: 12 }}
                                                >
                                                    ({bmi.category})
                                                </span>
                                            </>
                                        ) : (
                                            <span className="results-label">—</span>
                                        )}
                                    </span>
                                    <span style={cellStyle}>{r.date}</span>
                                    <span style={{ ...cellStyle, flex: '0 0 140px', display: 'flex', gap: 8 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => startEdit(r)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            style={{ color: 'var(--vs-error)', borderColor: 'var(--vs-error)' }}
                                            onClick={() => remove(r.id)}
                                        >
                                            Delete
                                        </button>
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}