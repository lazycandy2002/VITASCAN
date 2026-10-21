
import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type KioskScreen = 'splash' | 'identity' | 'sensor' | 'results'

export type PromptKind = 'ready' | 'retry' | 'redo' | 'finish' | null

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
    finish: () => void
}

export interface KioskController {
    state: KioskState
    actions: KioskActions
}

export function useKiosk(): KioskController {
    const [state, setState] = useState<KioskState>(initialState)
    const stateRef = useRef(state)
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
                error: error instanceof Error
                    ? error.message
                    : String(error),
            })
        }
    }, [update])

    // Get Started opens the dashboard only.
    // It does not connect to Arduino or send START.
    const enterIdentity = useCallback(() => {
        update({
            screen: 'identity',
            sectionTitle: 'VITAL SIGNS',
            promptKind: null,
            results: {},
            stepIndex: 0,
            error: '',
            statusLine: 'Connect the Arduino, then start measurement.',
        })
    }, [update])

    const connectDevice = useCallback(async () => {
        try {
            await kioskSerial.connect()
            update({
                connected: true,
                error: '',
                statusLine: 'Arduino connected and ready.',
            })
        } catch (error) {
            update({
                connected: false,
                error: error instanceof Error
                    ? error.message
                    : String(error),
            })
        }
    }, [update])

    // Start the sensor-only Arduino workflow.
    const start = useCallback(() => {
        if (!stateRef.current.connected) {
            update({
                error: 'Connect the Arduino before starting measurement.',
            })
            return
        }

        confirmModeRef.current = null

        update({
            screen: 'sensor',
            sectionTitle: 'Starting measurement',
            promptKind: null,
            results: {},
            stepIndex: 0,
            error: '',
            statusLine: 'Sending START to Arduino...',
        })

        void send('START')
    }, [send, update])

    const calibrateWeight = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Connect the Arduino before calibration.' })
            return
        }

        update({
            error: '',
            statusLine: 'Starting weight calibration...',
        })

        void send('CALIBRATE')
    }, [send, update])

    const answerConfirm = useCallback((yes: boolean) => {
        if (!stateRef.current.connected) {
            update({ error: 'Arduino is not connected.' })
            return
        }

        const mode = confirmModeRef.current

        if (!mode) {
            update({
                error: 'No active confirmation prompt from Arduino.',
            })
            return
        }

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

    const finish = useCallback(() => {
        if (!stateRef.current.connected) {
            update({ error: 'Arduino is not connected.' })
            return
        }

        if (confirmModeRef.current !== 'finish') {
            update({
                error: 'The Arduino has not reached the end-of-session prompt.',
            })
            return
        }

        void send('END')
    }, [send, update])

    useEffect(() => {
        const removeLine = kioskSerial.onLine(line => {
            const upper = line.trim().toUpperCase()

            // Arduino step notifications, e.g. STEP 1: TEMPERATURE
            const stepMatch = upper.match(/STEP\s+(\d+):\s*(.+)/)

            if (stepMatch) {
                const stepNumber = Number(stepMatch[1])
                const title = stepMatch[2].trim()

                update({
                    screen: 'sensor',
                    sectionTitle: title,
                    stepIndex: stepNumber,
                    promptKind: null,
                    error: '',
                    statusLine: `Measuring ${title.toLowerCase()}...`,
                })
                return
            }

            // Support optional prompts from Arduino firmware.
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
                    statusLine: 'Accept the reading or redo it.',
                })
                return
            }

            if (upper.includes('READY TO START?')) {
                confirmModeRef.current = 'ready'
                update({
                    screen: 'sensor',
                    promptKind: 'ready',
                    statusLine: 'Confirm when ready.',
                })
                return
            }

            // Parse final sensor values.
            const resultMatch = upper.match(
                /^(TEMPERATURE|RAW_BPM|CORRECTED_BPM|SPO2|HEIGHT|WEIGHT|BMI|BMI_CATEGORY):\s*(.*)$/,
            )

            if (resultMatch) {
                update({
                    results: {
                        ...stateRef.current.results,
                        [resultMatch[1]]: resultMatch[2].trim(),
                    },
                    screen: 'results',
                    statusLine: 'Receiving measurement results...',
                })
                return
            }

            if (upper.includes('MEASUREMENT STARTED')) {
                update({
                    screen: 'sensor',
                    statusLine: 'Arduino measurement started.',
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
                    statusLine: 'Measurement complete. End the session when ready.',
                })
                return
            }

            if (upper.includes('END COMMAND RECEIVED')) {
                confirmModeRef.current = null

                update({
                    screen: 'splash',
                    sectionTitle: '',
                    promptKind: null,
                    results: {},
                    stepIndex: 0,
                    error: '',
                    statusLine: 'Session ended. Ready for the next measurement.',
                })
                return
            }

            if (upper === 'SYSTEM READY') {
                update({
                    statusLine: 'Arduino system ready.',
                })
                return
            }

            if (upper.startsWith('ERROR:')) {
                update({
                    error: line,
                    statusLine: line,
                })
                return
            }

            if (upper.startsWith('WARNING:')) {
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
            enterIdentity,
            start,
            calibrateWeight,
            answerConfirm,
            finish,
        },
    }
}
