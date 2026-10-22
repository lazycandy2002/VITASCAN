import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type KioskScreen = 'splash' | 'identity' | 'sensor' | 'results'

/**
 * booting   - Arduino just connected / reset, scale is zeroing
 * idle      - waiting for the user to press Start
 * running   - Arduino is measuring (or processing a command)
 * waitDone  - Arduino waits for "done" (height / weight)
 * confirm   - result ready, waiting for Retake (y) or Accept (n)
 * complete  - all five measurements accepted
 */
export type Phase =
    | 'booting'
    | 'idle'
    | 'running'
    | 'waitDone'
    | 'confirm'
    | 'complete'

export const STEPS = [
    'TEMPERATURE',
    'PULSE',
    'OXYGEN',
    'HEIGHT',
    'WEIGHT',
] as const

export type StepKey = (typeof STEPS)[number]

/** undefined = not measured yet, null = measurement failed */
export type KioskResults = Partial<Record<StepKey, number | null>>

/** rx = from Arduino, tx = sent to Arduino, sys = connection events */
export interface SerialLogEntry {
    id: number
    dir: 'rx' | 'tx' | 'sys'
    text: string
    time: number
}

const MAX_LOG = 300

export interface KioskState {
    screen: KioskScreen
    phase: Phase
    /** 0-based index into STEPS, -1 when no step is active */
    stepIndex: number
    results: KioskResults
    accepted: boolean[]
    connected: boolean
    error: string
    statusLine: string
    warnings: string[]
    log: SerialLogEntry[]
}

const noneAccepted = () => STEPS.map(() => false)

const initialState: KioskState = {
    screen: 'splash',
    phase: 'booting',
    stepIndex: -1,
    results: {},
    accepted: noneAccepted(),
    connected: false,
    error: '',
    statusLine: 'Welcome to VitaScan.',
    warnings: [],
    log: [],
}

export interface KioskActions {
    connectDevice: () => void
    enterIdentity: () => void
    start: () => void
    retake: () => void
    accept: () => void
    next: () => void
    measure: () => void
    tare: () => void
    newSession: () => void
    clearLog: () => void
    /** Send a raw sketch command: start, y, n, next, done, tare */
    sendCommand: (command: string) => void
}

export interface KioskController {
    state: KioskState
    actions: KioskActions
}

export function computeBmi(
    heightCm?: number | null,
    weightKg?: number | null,
) {
    if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
        return null
    }
    const m = heightCm / 100
    const bmi = weightKg / (m * m)
    const category =
        bmi < 18.5
            ? 'Underweight'
            : bmi < 25
              ? 'Normal weight'
              : bmi < 30
                ? 'Overweight'
                : 'Obese'
    return { bmi, category }
}

// Names printed after "STEP: " by the Arduino sketch
const STEP_BY_NAME: Record<string, number> = {
    TEMPERATURE: 0,
    'PULSE RATE': 1,
    'OXYGEN SATURATION': 2,
    HEIGHT: 3,
    WEIGHT: 4,
}

const VALUE_LINES: Array<[RegExp, StepKey]> = [
    [/^TEMP_C:\s*(-?\d+(?:\.\d+)?)/, 'TEMPERATURE'],
    [/^PULSE_BPM:\s*(-?\d+(?:\.\d+)?)/, 'PULSE'],
    [/^SPO2_PERCENT:\s*(-?\d+(?:\.\d+)?)/, 'OXYGEN'],
    [/^HEIGHT_CM:\s*(-?\d+(?:\.\d+)?)/, 'HEIGHT'],
    [/^WEIGHT_KG:\s*(-?\d+(?:\.\d+)?)/, 'WEIGHT'],
]

const ERROR_PREFIX: Record<string, number> = {
    TEMP: 0,
    PULSE: 1,
    SPO2: 2,
    HEIGHT: 3,
    WEIGHT: 4,
}

const ACCEPTED_INDEX: Record<string, number> = {
    TEMPERATURE: 0,
    PULSE: 1,
    SPO2: 2,
    HEIGHT: 3,
    WEIGHT: 4,
}

const INSTRUCTION_PREFIXES = [
    'Aim the',
    'Averaging',
    'Place your finger',
    'Keep your finger',
    'Collecting',
    'Measuring height',
    'Reading HX711',
    'Keep the platform',
]

const WAIT_DONE_LINES = new Set([
    'Type done to measure height.',
    'Type done when you are standing still.',
    'Type done to measure again.',
])

export function useKiosk(): KioskController {
    const [state, setState] = useState<KioskState>(initialState)
    const stateRef = useRef(state)
    const bootTimer = useRef<number | undefined>(undefined)
    const logId = useRef(0)

    useEffect(() => {
        stateRef.current = state
    }, [state])

    const update = useCallback((patch: Partial<KioskState>) => {
        setState(previous => ({ ...previous, ...patch }))
    }, [])

    const pushLog = useCallback(
        (dir: SerialLogEntry['dir'], text: string) => {
            const entry: SerialLogEntry = {
                id: ++logId.current,
                dir,
                text,
                time: Date.now(),
            }
            setState(s => ({
                ...s,
                log: [...s.log, entry].slice(-MAX_LOG),
            }))
        },
        [],
    )

    const clearLog = useCallback(() => {
        setState(s => ({ ...s, log: [] }))
    }, [])

    const send = useCallback(
        async (command: string) => {
            try {
                pushLog('tx', command)
                await kioskSerial.sendLine(command)
                update({ error: '' })
            } catch (error) {
                update({
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                })
            }
        },
        [update, pushLog],
    )

    // ---------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------
    const enterIdentity = useCallback(() => {
        update({
            screen: 'identity',
            stepIndex: -1,
            results: {},
            accepted: noneAccepted(),
            error: '',
            statusLine: 'Connect the device, then enter patient details.',
        })
    }, [update])

    const connectDevice = useCallback(async () => {
        try {
            await kioskSerial.connect()

            update({
                connected: true,
                phase: 'booting',
                warnings: [],
                error: '',
                statusLine:
                    'Device starting. Keep the weighing platform empty…',
            })

            // Opening the port resets most Arduino boards. If the banner is
            // missed, fall back to idle after a while.
            window.clearTimeout(bootTimer.current)
            bootTimer.current = window.setTimeout(() => {
                setState(s =>
                    s.phase === 'booting'
                        ? { ...s, phase: 'idle', statusLine: '' }
                        : s,
                )
            }, 12000)
        } catch (error) {
            update({
                connected: false,
                error:
                    error instanceof Error ? error.message : String(error),
            })
        }
    }, [update])

    const start = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the device before starting.' })
            return
        }

        update({
            screen: 'sensor',
            phase: 'running',
            stepIndex: 0,
            results: {},
            accepted: noneAccepted(),
            error: '',
            statusLine: 'Starting…',
        })

        void send('start')
    }, [send, update])

    const retake = useCallback(async () => {
        const i = stateRef.current.stepIndex
        if (i < 0) return

        setState(s => ({
            ...s,
            phase: 'running',
            statusLine: '',
            results: { ...s.results, [STEPS[i]]: undefined },
        }))

        // Y only. Weight returns to "type done", which shows Measure.
        await send('y')
    }, [send])

    const accept = useCallback(async () => {
        const i = stateRef.current.stepIndex
        if (i < 0) return

        setState(s => ({
            ...s,
            accepted: s.accepted.map((v, k) => (k === i ? true : v)),
            statusLine: '',
        }))

        // N only. "Next" is its own button, like typing it.
        await send('n')
    }, [send])

    const next = useCallback(() => {
        update({ phase: 'running', statusLine: '', error: '' })
        void send('next')
    }, [send, update])

    const measure = useCallback(() => {
        update({ phase: 'running', statusLine: '' })
        void send('done')
    }, [send, update])

    const tare = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the device first.' })
            return
        }
        update({ error: '', statusLine: 'Zeroing scale…' })
        void send('tare')
    }, [send, update])

    // Manual override: send a raw command. The screen then follows whatever
    // the Arduino prints back.
    const sendCommand = useCallback(
        (command: string) => {
            if (!stateRef.current.connected) {
                update({ error: 'Connect the device first.' })
                return
            }

            const c = command.trim().toLowerCase()
            if (!c) return

            if (c === 'start') {
                update({
                    screen: 'sensor',
                    phase: 'running',
                    stepIndex: 0,
                    results: {},
                    accepted: noneAccepted(),
                    error: '',
                    statusLine: 'Starting…',
                })
            } else {
                update({ error: '' })
            }

            void send(c)
        },
        [send, update],
    )

    // UI reset only; the Arduino stays in ALL_DONE, which accepts "start".
    const newSession = useCallback(() => {
        update({
            screen: 'identity',
            phase: 'idle',
            stepIndex: -1,
            results: {},
            accepted: noneAccepted(),
            error: '',
            statusLine: '',
        })
    }, [update])

    // ---------------------------------------------------------------
    // Serial line parser
    // ---------------------------------------------------------------
    useEffect(() => {
        const removeLine = kioskSerial.onLine(raw => {
            const line = raw.trim()

            // Everything the Arduino prints goes to the serial monitor
            if (line) pushLog('rx', line)

            if (!line || /^[-=]+$/.test(line)) return

            // Boot finished
            if (
                line.startsWith('Type start to begin') ||
                line === 'SCALE CALIBRATED AND ZEROED' ||
                line.startsWith('Calibration factor')
            ) {
                window.clearTimeout(bootTimer.current)
                setState(s => ({
                    ...s,
                    phase: s.phase === 'booting' ? 'idle' : s.phase,
                    statusLine: '',
                }))
                return
            }

            // Sensor missing at boot
            if (
                line.endsWith('NOT DETECTED') ||
                line.includes('NOT READY DURING TARE')
            ) {
                setState(s => ({ ...s, warnings: [...s.warnings, line] }))
                return
            }

            if (line === 'NEW MEASUREMENT SESSION') {
                setState(s => ({
                    ...s,
                    results: {},
                    accepted: noneAccepted(),
                }))
                return
            }

            // STEP: TEMPERATURE | PULSE RATE | OXYGEN SATURATION | HEIGHT | WEIGHT
            if (line.startsWith('STEP: ')) {
                const idx = STEP_BY_NAME[line.slice(6).trim()]
                if (idx !== undefined) {
                    setState(s => ({
                        ...s,
                        screen: 'sensor',
                        phase: 'running',
                        stepIndex: idx,
                        results: { ...s.results, [STEPS[idx]]: undefined },
                        accepted: s.accepted.map((v, k) =>
                            k === idx ? false : v,
                        ),
                        statusLine: '',
                        error: '',
                    }))
                }
                return
            }

            // TEMPERATURE_ACCEPTED, PULSE_ACCEPTED, SPO2_ACCEPTED, ...
            const acc = line.match(
                /^(TEMPERATURE|PULSE|SPO2|HEIGHT|WEIGHT)_ACCEPTED$/,
            )
            if (acc) {
                const idx = ACCEPTED_INDEX[acc[1]]
                setState(s => ({
                    ...s,
                    accepted: s.accepted.map((v, k) =>
                        k === idx ? true : v,
                    ),
                }))
                return
            }

            // Numeric results
            for (const [re, key] of VALUE_LINES) {
                const m = line.match(re)
                if (m) {
                    setState(s => ({
                        ...s,
                        results: { ...s.results, [key]: Number(m[1]) },
                    }))
                    return
                }
            }

            // TEMP_ERROR / PULSE_ERROR / SPO2_ERROR / HEIGHT_ERROR /
            // WEIGHT_ERROR / MAX30102_ERROR
            const err = line.match(/^([A-Z0-9]+)_ERROR:\s*(.*)$/)
            if (err) {
                setState(s => {
                    const idx = ERROR_PREFIX[err[1]] ?? s.stepIndex
                    return {
                        ...s,
                        results:
                            idx >= 0
                                ? { ...s.results, [STEPS[idx]]: null }
                                : s.results,
                        statusLine: err[2] || 'Measurement failed.',
                    }
                })
                return
            }

            // "<SENSOR> RESULT READY" -> Retake / Accept
            if (line.endsWith('RESULT READY')) {
                update({ phase: 'confirm' })
                return
            }

            // Height / weight wait for "done"
            if (WAIT_DONE_LINES.has(line)) {
                update({ phase: 'waitDone', statusLine: '' })
                return
            }

            if (line === 'ALL MEASUREMENTS COMPLETED') {
                update({
                    screen: 'results',
                    phase: 'complete',
                    statusLine: 'All measurements complete.',
                })
                return
            }

            if (line === 'TARING_SCALE') {
                update({ statusLine: 'Zeroing scale…' })
                return
            }

            if (line === 'SCALE_TARED') {
                update({ statusLine: 'Scale zeroed.' })
                return
            }

            if (line === 'FINGER_DETECTED') {
                update({ statusLine: 'Finger detected. Hold still…' })
                return
            }

            if (INSTRUCTION_PREFIXES.some(p => line.startsWith(p))) {
                update({ statusLine: line })
            }
        })

        const removeStatus = kioskSerial.onStatus(connected => {
            if (connected) {
                pushLog('sys', 'Device connected')
                update({ connected: true, error: '' })
            } else {
                pushLog('sys', 'Device disconnected')
                update({
                    connected: false,
                    phase: 'booting',
                    error: 'Device disconnected.',
                    statusLine: 'Connect the device to continue.',
                })
            }
        })

        return () => {
            removeLine()
            removeStatus()
            window.clearTimeout(bootTimer.current)
        }
    }, [update, pushLog])

    return {
        state,
        actions: {
            connectDevice,
            enterIdentity,
            start,
            retake,
            accept,
            next,
            measure,
            tare,
            newSession,
            clearLog,
            sendCommand,
        },
    }
}