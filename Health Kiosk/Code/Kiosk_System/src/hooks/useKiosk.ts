
import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type KioskScreen = 'splash' | 'identity' | 'sensor' | 'results'

export type PromptKind = 'ready' | 'retry' | 'redo' | 'finish' | null

export interface PatientIdentity {
    name: string
    age: string
    gender: 'M' | 'F' | ''
}

export interface KioskResults {
    TEMPERATURE?: string
    RAW_BPM?: string
    CORRECTED_BPM?: string
    SPO2?: string
    HEIGHT?: string
    WEIGHT?: string
    BMI?: string
    BMI_CATEGORY?: string
}

export interface KioskState {
    screen: KioskScreen
    sectionTitle: string
    promptKind: PromptKind
    identity: PatientIdentity
    results: KioskResults
    stepIndex: number
    connected: boolean
    error: string
    statusLine: string
}

const initialState: KioskState = {
    screen: 'splash',
    sectionTitle: '',
    promptKind: null,
    identity: { name: '', age: '', gender: '' },
    results: {},
    stepIndex: 0,
    connected: false,
    error: '',
    statusLine: 'Welcome to VitaScan.',
}

export interface KioskActions {
    connectDevice: () => void
    enterIdentity: () => void
    start: () => void
    calibrateWeight: () => void
    answerConfirm: (yes: boolean) => void
    submitName: (value: string) => void
    submitAge: (value: string) => void
    submitGender: (value: 'M' | 'F') => void
    finish: () => void
}

export interface KioskController {
    state: KioskState
    actions: KioskActions
}

export function useKiosk(): KioskController {
    const [state, setState] = useState<KioskState>(initialState)
    const stateRef = useRef(state)
    const currentStepRef = useRef('')
    const confirmModeRef = useRef<PromptKind>(null)

    useEffect(() => {
        stateRef.current = state
    }, [state])

    const update = useCallback((patch: Partial<KioskState>) => {
        setState(previous => ({ ...previous, ...patch }))
    }, [])

    const send = useCallback(async (command: string) => {
        try {
            await kioskSerial.sendLine(command)
            update({ error: '' })
        } catch (error) {
            update({
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }, [update])

    // Get Started only opens the patient information screen.
    // It does not connect to or send commands to the Arduino.
    const enterIdentity = useCallback(() => {
        update({
            screen: 'identity',
            sectionTitle: 'PATIENT INFORMATION',
            promptKind: null,
            identity: { name: '', age: '', gender: '' },
            results: {},
            stepIndex: 0,
            error: '',
            statusLine: 'Enter patient information, then start the measurement.',
        })
    }, [update])

    const connectDevice = useCallback(async () => {
        try {
            await kioskSerial.connect()
            update({
                connected: true,
                error: '',
                statusLine: 'Arduino connected.',
            })
        } catch (error) {
            update({
                connected: false,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }, [update])

    // This sends START only when the Start Measurement button is clicked.
    const start = useCallback(() => {
        if (!stateRef.current.connected) {
            update({
                error: 'Connect the Arduino before starting the measurement.',
            })
            return
        }

        currentStepRef.current = ''
        confirmModeRef.current = null

        update({
            screen: 'sensor',
            sectionTitle: 'Starting measurement',
            promptKind: null,
            results: {},
            stepIndex: 0,
            error: '',
            statusLine: 'Starting Arduino measurement...',
        })

        void send('START')
    }, [send, update])

    const calibrateWeight = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino before calibrating.' })
            return
        }

        update({
            error: '',
            statusLine: 'Weight calibration started. Follow the Arduino prompts.',
        })

        void send('CALIBRATE')
    }, [send, update])

    const answerConfirm = useCallback((yes: boolean) => {
        if (!stateRef.current.connected) {
            update({ error: 'Arduino is not connected.' })
            return
        }

        if (!confirmModeRef.current) {
            update({ error: 'There is no active Arduino confirmation prompt.' })
            return
        }

        const mode = confirmModeRef.current

        if (mode === 'finish') {
            if (yes) {
                void send('END')
            }
            return
        }

        confirmModeRef.current = null
        update({
            promptKind: null,
            error: '',
            statusLine: yes ? 'Confirmation sent.' : 'Response sent.',
        })

        void send(yes ? 'Y' : 'N')
    }, [send, update])

    const submitName = useCallback((value: string) => {
        const name = value.trim()

        if (!name) {
            update({ error: 'Please enter the patient name.' })
            return
        }

        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino before submitting patient details.' })
            return
        }

        update({
            identity: { ...stateRef.current.identity, name },
            error: '',
        })

        void send(name)
    }, [send, update])

    const submitAge = useCallback((value: string) => {
        const age = Number(value)

        if (!Number.isInteger(age) || age < 1 || age > 120) {
            update({ error: 'Enter a valid age from 1 to 120.' })
            return
        }

        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino before submitting patient details.' })
            return
        }

        update({
            identity: { ...stateRef.current.identity, age: String(age) },
            error: '',
        })

        void send(String(age))
    }, [send, update])

    const submitGender = useCallback((gender: 'M' | 'F') => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino before submitting patient details.' })
            return
        }

        update({
            identity: { ...stateRef.current.identity, gender },
            error: '',
        })

        void send(gender)
    }, [send, update])

    const finish = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Arduino is not connected.' })
            return
        }

        if (confirmModeRef.current !== 'finish') {
            update({ error: 'The Arduino is not waiting for END yet.' })
            return
        }

        void send('END')
    }, [send, update])

    useEffect(() => {
        const removeLine = kioskSerial.onLine(line => {
            const upper = line.trim().toUpperCase()
            const current = stateRef.current

            // Arduino measurement steps
            const stepMatch = upper.match(/STEP\s+(\d+):\s*(.+)/)

            if (stepMatch) {
                const stepNumber = Number(stepMatch[1])
                const title = stepMatch[2].trim()

                currentStepRef.current = title

                update({
                    screen: stepNumber === 0 ? 'identity' : 'sensor',
                    sectionTitle: title,
                    stepIndex: stepNumber,
                    promptKind: null,
                    error: '',
                    statusLine: `Arduino step: ${title}`,
                })
                return
            }

            if (upper.includes('TRY AGAIN?')) {
                confirmModeRef.current = 'retry'
                update({
                    screen: 'sensor',
                    promptKind: 'retry',
                    statusLine: 'No valid reading. Try again or skip.',
                })
                return
            }

            if (upper.includes('REDO THIS STEP?')) {
                confirmModeRef.current = 'redo'
                update({
                    screen: 'sensor',
                    promptKind: 'redo',
                    statusLine: 'Accept this reading or redo the measurement.',
                })
                return
            }

            if (upper.includes('READY TO START?')) {
                confirmModeRef.current = 'ready'
                update({
                    promptKind: 'ready',
                    statusLine: 'Confirm when you are ready.',
                })
                return
            }

            // Identity and results printed by the Arduino
            if (upper.startsWith('NAME:')) {
                update({
                    identity: {
                        ...current.identity,
                        name: line.slice(line.indexOf(':') + 1).trim(),
                    },
                })
                return
            }

            if (upper.startsWith('AGE:')) {
                update({
                    identity: {
                        ...current.identity,
                        age: line.slice(line.indexOf(':') + 1).trim(),
                    },
                })
                return
            }

            if (upper.startsWith('GENDER:')) {
                const gender = line.slice(line.indexOf(':') + 1).trim().toUpperCase()

                update({
                    identity: {
                        ...current.identity,
                        gender: gender.startsWith('M') ? 'M' : 'F',
                    },
                })
                return
            }

            const resultMatch = upper.match(
                /^(TEMPERATURE|RAW_BPM|CORRECTED_BPM|SPO2|HEIGHT|WEIGHT|BMI|BMI_CATEGORY):\s*(.*)$/,
            )

            if (resultMatch) {
                update({
                    results: {
                        ...stateRef.current.results,
                        [resultMatch[1]]: resultMatch[2].trim(),
                    },
                })
                return
            }

            if (upper.includes('MEASUREMENT COMPLETE')) {
                update({
                    screen: 'results',
                    promptKind: null,
                    statusLine: 'Measurement complete.',
                })
                return
            }

            if (upper.includes('RESULTS WILL REMAIN DISPLAYED')) {
                confirmModeRef.current = 'finish'
                update({
                    screen: 'results',
                    promptKind: 'finish',
                    statusLine: 'End the session when you are finished.',
                })
                return
            }

            if (upper.includes('END COMMAND RECEIVED')) {
                confirmModeRef.current = null
                currentStepRef.current = ''

                update({
                    screen: 'splash',
                    sectionTitle: '',
                    promptKind: null,
                    identity: { name: '', age: '', gender: '' },
                    results: {},
                    stepIndex: 0,
                    error: '',
                    statusLine: 'Session ended. Ready for the next patient.',
                })
                return
            }

            if (upper === 'SYSTEM READY') {
                update({
                    statusLine: 'Arduino ready.',
                })
                return
            }

            if (upper.startsWith('ERROR:')) {
                update({ error: line, statusLine: line })
            }
        })

        const removeStatus = kioskSerial.onStatus(connected => {
            update({
                connected,
                error: connected ? '' : 'Arduino disconnected.',
                statusLine: connected
                    ? 'Arduino connected.'
                    : 'Connect the Arduino to continue.',
            })
        })

        return () => {
            removeLine()
            removeStatus()
        }
    }, [update])

    return {
        state,
        actions: {
            connectDevice,
            enterIdentity,
            start,
            calibrateWeight,
            answerConfirm,
            submitName,
            submitAge,
            submitGender,
            finish,
        },
    }
}
