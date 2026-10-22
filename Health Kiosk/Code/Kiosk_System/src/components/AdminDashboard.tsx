import { useMemo, useState } from 'react'
import { IconCheck } from './icons'
import {
    loadRecords,
    saveRecords,
    newId,
    todayLocal,
    type PatientRecord,
} from '../data/recordsStore'

export type { PatientRecord }

const makeEmptyForm = (): Omit<PatientRecord, 'id'> => ({
    name: '',
    age: '',
    gender: 'M',
    temperature: '',
    pulse: '',
    oxygen: '',
    height: '',
    weight: '',
    date: todayLocal(),
})

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

const withUnit = (v: string, unit: string) => (v ? `${v}${unit}` : '—')

// Escape one CSV cell (and block spreadsheet formula injection)
function csvCell(value: string): string {
    let v = value ?? ''
    if (/^[=+\-@]/.test(v)) v = `'${v}`
    return `"${v.replace(/"/g, '""')}"`
}

function downloadCsv(records: PatientRecord[]) {
    const header = [
        'Name',
        'Age',
        'Gender',
        'Temperature (C)',
        'Pulse (bpm)',
        'Oxygen (%)',
        'Height (cm)',
        'Weight (kg)',
        'BMI',
        'BMI Category',
        'Date',
    ]

    const lines = records.map((r) => {
        const bmi = computeBMI(r.height, r.weight)
        return [
            r.name,
            r.age,
            r.gender === 'M' ? 'Male' : 'Female',
            r.temperature,
            r.pulse,
            r.oxygen,
            r.height,
            r.weight,
            bmi ? bmi.value : '',
            bmi ? bmi.category : '',
            r.date,
        ]
            .map(csvCell)
            .join(',')
    })

    // BOM so Excel reads the file as UTF-8
    const csv = '\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vitascan-records-${todayLocal()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

export default function AdminDashboard({ onClose, onLogout }: Props) {
    const [records, setRecords] = useState<PatientRecord[]>(loadRecords)
    const [form, setForm] = useState<Omit<PatientRecord, 'id'>>(makeEmptyForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [query, setQuery] = useState('')

    // Update the screen and save in one step
    const commit = (next: PatientRecord[]) => {
        setRecords(next)
        saveRecords(next)
    }

    const startCreate = () => {
        setForm(makeEmptyForm())
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
            commit(records.filter((r) => r.id !== id))
        }
    }

    const save = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) return

        if (editingId) {
            commit(records.map((r) => (r.id === editingId ? { ...form, id: editingId } : r)))
        } else {
            commit([...records, { ...form, id: newId() }])
        }
        setShowForm(false)
        setEditingId(null)
    }

    const field = (key: keyof Omit<PatientRecord, 'id'>) => ({
        value: form[key],
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value })),
    })

    // newest first, filtered by name
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase()
        return [...records]
            .reverse()
            .filter((r) => !q || r.name.toLowerCase().includes(q))
    }, [records, query])

    return (
        <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Patient records">
            <div className="admin-modal">
                <header className="admin-head">
                    <div>
                        <h2 className="admin-title">Patient records</h2>
                        <p className="admin-sub">
                            {records.length} {records.length === 1 ? 'record' : 'records'} saved on this kiosk
                        </p>
                    </div>
                    <button type="button" className="admin-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </header>

                <div className="admin-toolbar">
                    <input
                        className="field-input admin-search"
                        type="search"
                        placeholder="Search by name"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="btn-row">
                        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                            + Add record
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={rows.length === 0}
                            onClick={() => downloadCsv(rows)}
                        >
                            Download CSV
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
                </div>

                {showForm && (
                    <form onSubmit={save} className="admin-form">
                        <h3 className="admin-form-title">
                            {editingId ? 'Edit record' : 'New record'}
                        </h3>
                        <div className="admin-form-grid">
                            <div className="field-row">
                                <label className="field-label">Name</label>
                                <input className="field-input" {...field('name')} required />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Age</label>
                                <input className="field-input" inputMode="numeric" {...field('age')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Gender</label>
                                <select className="field-input" {...field('gender')}>
                                    <option value="M">Male</option>
                                    <option value="F">Female</option>
                                </select>
                            </div>
                            <div className="field-row">
                                <label className="field-label">Temperature (°C)</label>
                                <input className="field-input" inputMode="decimal" {...field('temperature')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Pulse rate (bpm)</label>
                                <input className="field-input" inputMode="numeric" {...field('pulse')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Oxygen (%)</label>
                                <input className="field-input" inputMode="numeric" {...field('oxygen')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Height (cm)</label>
                                <input className="field-input" inputMode="decimal" {...field('height')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Weight (kg)</label>
                                <input className="field-input" inputMode="decimal" {...field('weight')} />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Date</label>
                                <input className="field-input" type="date" {...field('date')} />
                            </div>
                        </div>

                        <div className="btn-row admin-form-actions">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowForm(false)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary btn-sm">
                                <IconCheck className="icon-sm" />
                                {editingId ? 'Save changes' : 'Add record'}
                            </button>
                        </div>
                    </form>
                )}

                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th className="col-name">Name</th>
                                <th>Age / Sex</th>
                                <th className="num">Temp</th>
                                <th className="num">Pulse</th>
                                <th className="num">Oxygen</th>
                                <th className="num">Height</th>
                                <th className="num">Weight</th>
                                <th>BMI</th>
                                <th>Date</th>
                                <th className="col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="admin-empty">
                                        {records.length === 0
                                            ? 'No records yet. Completed check-ups are saved here automatically.'
                                            : 'No records match your search.'}
                                    </td>
                                </tr>
                            )}

                            {rows.map((r) => {
                                const bmi = computeBMI(r.height, r.weight)
                                const cat = bmi ? bmi.category.toLowerCase() : ''
                                return (
                                    <tr key={r.id}>
                                        <td className="col-name">{r.name}</td>
                                        <td>
                                            {r.age || '—'} / {r.gender}
                                        </td>
                                        <td className="num">{withUnit(r.temperature, ' °C')}</td>
                                        <td className="num">{withUnit(r.pulse, ' bpm')}</td>
                                        <td className="num">{withUnit(r.oxygen, ' %')}</td>
                                        <td className="num">{withUnit(r.height, ' cm')}</td>
                                        <td className="num">{withUnit(r.weight, ' kg')}</td>
                                        <td>
                                            {bmi ? (
                                                <span className={`bmi-badge bmi-b-${cat}`}>
                                                    <strong>{bmi.value}</strong>
                                                    {bmi.category}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="nowrap">{r.date}</td>
                                        <td className="col-actions">
                                            <div className="btn-row">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => startEdit(r)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm btn-danger"
                                                    onClick={() => remove(r.id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}