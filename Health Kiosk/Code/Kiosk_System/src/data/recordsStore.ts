// Saves patient records in the browser (localStorage) so they survive
// page reloads and kiosk restarts.

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

const STORAGE_KEY = 'vitascan.records.v1'

export function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Local date (YYYY-MM-DD), not UTC, so the date is right near midnight
export function todayLocal(): string {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
}

export function loadRecords(): PatientRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as PatientRecord[]) : []
    } catch {
        return []
    }
}

export function saveRecords(records: PatientRecord[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch (err) {
        console.error('Could not save records', err)
    }
}

export function addRecord(data: Omit<PatientRecord, 'id'>): PatientRecord {
    const record: PatientRecord = { ...data, id: newId() }
    saveRecords([...loadRecords(), record])
    return record
}