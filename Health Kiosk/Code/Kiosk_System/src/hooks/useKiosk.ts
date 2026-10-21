
import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type KioskScreen =
    | 'splash'
    | 'identity'
    | 'sensor'
    | 'results'

export type PromptKind =
    | 'ready'
    | 'retry'
    | 'redo'
    | 'finish'
    | null

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
    statusLine: 'Connect the Arduino to begin.',
}

const VITAL_STEPS: Record<string, number> = {
    TEMPERATURE: 1,
    'PULSE RATE': 2,
    OXYGEN: 3,
    HEIGHT: 4,
    WEIGHT: 5,
}

export interface KioskActions {
    connectDevice: () => void
    start: () => void
    calibrateWeight: () => void
    answerConfirm: (yes: boolean) => void
    submitName: (value: string) => void
    submitAge: (value: string) => void
    submitGender: (value: 'M' | 'F') => void
    finish: () => void
}

export type KioskController = {
    state: KioskState
    actions: KioskActions
}

export function useKiosk(): KioskController {
    const [state, setState] = useState<KioskState>(initialState)
    const stateRef = useRef(state)
    const pendingIdentityRef = useRef<'name' | 'age' | 'gender' | null>(null)
    const currentStepRef = useRef('')
    const confirmModeRef = useRef<'ready' | 'retry' | 'redo' | 'finish' | null>(null)
    const startRequestedRef = useRef(false)

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

    const connectDevice = useCallback(async () => {
        try {
            await kioskSerial.connect()
            update({
                connected: true,
                error: '',
                statusLine: 'Arduino connected. Ready to start.',
            })
        } catch (error) {
            update({
                connected: false,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }, [update])

    const start = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino first.' })
            return
        }

        startRequestedRef.current = true
        currentStepRef.current = ''
        pendingIdentityRef.current = null
        confirmModeRef.current = null

        update({
            screen: 'identity',
            sectionTitle: 'NAME',
            promptKind: null,
            identity: { name: '', age: '', gender: '' },
            results: {},
            stepIndex: 0,
            error: '',
            statusLine: 'Starting measurement...',
        })

        void send('START')
    }, [send, update])

    const calibrateWeight = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino first.' })
            return
        }

        update({
            error: '',
            statusLine: 'Weight calibration started. Follow Serial prompts.',
        })

        void send('CALIBRATE')
    }, [send, update])

    const answerConfirm = useCallback((yes: boolean) => {
        const current = stateRef.current
        const mode = confirmModeRef.current

        if (!current.connected || !mode) return

        if (mode === 'ready' && !yes) {
            confirmModeRef.current = null
            pendingIdentityRef.current = null
            update({
                promptKind: null,
                statusLine: 'Waiting for the next instruction.',
            })
        } else if (mode === 'redo' && !yes) {
            confirmModeRef.current = null
            update({
                promptKind: null,
                statusLine: 'Reading accepted.',
            })
        } else if (mode === 'finish') {
            if (yes) {
                void send('END')
            }
            return
        } else {
            confirmModeRef.current = null
            update({ promptKind: null })
        }

        void send(yes ? 'Y' : 'N')
    }, [send, update])

    const submitName = useCallback((value: string) => {
        if (!value.trim()) return
        if (!stateRef.current.connected) return

        update({
            identity: { ...stateRef.current.identity, name: value.trim() },
            statusLine: 'Name submitted.',
        })
        pendingIdentityRef.current = null
        void send(value.trim())
    }, [send, update])

    const submitAge = useCallback((value: string) => {
        const age = Number(value)
        if (!Number.isInteger(age) || age < 1 || age > 120) {
            update({ error: 'Enter an age from 1 to 120.' })
            return
        }
        if (!stateRef.current.connected) return

        update({
            identity: { ...stateRef.current.identity, age: String(age) },
            error: '',
            statusLine: 'Age submitted.',
        })
        pendingIdentityRef.current = null
        void send(String(age))
    }, [send, update])

    const submitGender = useCallback((gender: 'M' | 'F') => {
        if (!stateRef.current.connected) return

        update({
            identity: { ...stateRef.current.identity, gender },
            statusLine: 'Gender submitted.',
        })
        pendingIdentityRef.current = null
        void send(gender)
    }, [send, update])

    const finish = useCallback(() => {
        if (!stateRef.current.connected) return
        if (confirmModeRef.current !== 'finish') return
        void send('END')
    }, [send])

    useEffect(() => {
        const removeLine = kioskSerial.onLine(line => {
            const upper = line.trim().toUpperCase()
            const current = stateRef.current

            if (upper.includes('START COMMAND RECEIVED')) {
                startRequestedRef.current = true
                return
            }

            if (upper.includes('STEP 0: NAME')) {
                currentStepRef.current = 'NAME'
                update({
                    screen: 'identity',
                    sectionTitle: 'NAME',
                    statusLine: 'Enter the patient name.',
                })
                return
            }

            if (upper.includes('STEP 0: AGE')) {
                currentStepRef.current = 'AGE'
                update({
                    screen: 'identity',
                    sectionTitle: 'AGE',
                    statusLine: 'Enter the patient age.',
                })
                return
            }

            if (upper.includes('STEP 0: GENDER')) {
                currentStepRef.current = 'GENDER'
                update({
                    screen: 'identity',
                    sectionTitle: 'GENDER',
                    statusLine: 'Select the patient gender.',
                })
                return
            }

            const stepMatch = upper.match(/STEP ([1-5]):\s*(.+)/)
            if (stepMatch) {
                const title = stepMatch[2].trim()
                currentStepRef.current = title
                confirmModeRef.current = null

                update({
                    screen: 'sensor',
                    sectionTitle: title,
                    stepIndex: Number(stepMatch[1]),
                    promptKind: null,
                    statusLine: `Preparing ${title.toLowerCase()} measurement.`,
                })
                return
            }

            if (upper.includes('READY TO START?')) {
                const step = currentStepRef.current

                if (step === 'NAME' || step === 'AGE' || step === 'GENDER') {
                    pendingIdentityRef.current =
                        step.toLowerCase() as 'name' | 'age' | 'gender'
                    update({
                        screen: 'identity',
                        sectionTitle: step,
                        promptKind: 'ready',
                        statusLine: `Confirm to enter ${step.toLowerCase()}.`,
                    })
                } else {
                    confirmModeRef.current = 'ready'
                    update({
                        screen: 'sensor',
                        promptKind: 'ready',
                        statusLine: 'Confirm when ready.',
                    })
                }
                return
            }

            if (upper.includes('TRY AGAIN?')) {
                confirmModeRef.current = 'retry'
                update({
                    screen: 'sensor',
                    promptKind: 'retry',
                    statusLine: 'No valid reading was captured.',
                })
                return
            }

            if (upper.includes('REDO THIS STEP?')) {
                confirmModeRef.current = 'redo'
                update({
                    screen: 'sensor',
                    promptKind: 'redo',
                    statusLine: 'Reading captured. Accept or redo.',
                })
                return
            }

            if (upper.includes('TYPE YOUR NAME')) {
                pendingIdentityRef.current = 'name'
                update({ screen: 'identity', sectionTitle: 'NAME', promptKind: null })
                return
            }

            if (upper.includes('TYPE YOUR AGE')) {
                pendingIdentityRef.current = 'age'
                update({ screen: 'identity', sectionTitle: 'AGE', promptKind: null })
                return
            }

            if (upper.includes('SEND M FOR MALE')) {
                pendingIdentityRef.current = 'gender'
                update({ screen: 'identity', sectionTitle: 'GENDER', promptKind: null })
                return
            }

            if (upper.includes('REDO? Y=YES N=NO')) {
                return
            }

            if (upper.startsWith('NAME:')) {
                update({
                    identity: { ...current.identity, name: line.slice(5).trim() },
                })
                return
            }

            if (upper.startsWith('AGE:')) {
                update({
                    identity: { ...current.identity, age: line.slice(4).trim() },
                })
                return
            }

            if (upper.startsWith('GENDER:')) {
                const value = line.slice(7).trim().toUpperCase()
                update({
                    identity: {
                        ...current.identity,
                        gender: value.startsWith('M') ? 'M' : 'F',
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
                    statusLine: 'Send End Session when finished.',
                })
                return
            }

            if (upper.includes('END COMMAND RECEIVED')) {
                confirmModeRef.current = null
                pendingIdentityRef.current = null
                currentStepRef.current = ''
                startRequestedRef.current = false

                update({
                    screen: 'splash',
                    sectionTitle: '',
                    promptKind: null,
                    identity: { name: '', age: '', gender: '' },
                    results: {},
                    stepIndex: 0,
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
                return
            }

            if (
                upper.includes('CALIBRATION COMPLETE') ||
                upper.includes('CALIBRATION RESULT')
            ) {
                update({ statusLine: line })
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
