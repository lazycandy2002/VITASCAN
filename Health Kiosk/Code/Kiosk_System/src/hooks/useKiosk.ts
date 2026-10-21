
import { useCallback, useEffect, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type Screen = 'splash' | 'identity' | 'sensor' | 'results'

export type PromptKind =
  | 'ready'
  | 'retry'
  | 'redo'
  | 'name'
  | 'age'
  | 'gender'
  | 'finish'
  | null

export interface KioskState {
  screen: Screen
  connected: boolean
  error: string | null
  sectionTitle: string
  statusLine: string
  promptKind: PromptKind
  identity: {
    name: string
    age: string
    gender: string
  }
  results: Record<string, string>
  stepIndex: number
}

const SENSOR_STEPS = [
  'TEMPERATURE',
  'PULSE RATE',
  'OXYGEN',
  'HEIGHT',
  'WEIGHT',
]

const initialState = (): KioskState => ({
  screen: 'splash',
  connected: kioskSerial.isConnected,
  error: null,
  sectionTitle: 'VitaScan',
  statusLine: 'Connect the device to begin.',
  promptKind: null,
  identity: {
    name: '',
    age: '',
    gender: '',
  },
  results: {},
  stepIndex: 0,
})

export function useKiosk() {
  const [state, setState] = useState<KioskState>(initialState)

  const updateState = useCallback(
    (updates: Partial<KioskState>) => {
      setState((prev) => ({ ...prev, ...updates }))
    },
    []
  )

  const sendCommand = useCallback(async (command: string) => {
    try {
      await kioskSerial.sendLine(command)
      updateState({ error: null })
    } catch (err) {
      updateState({
        error:
          err instanceof Error
            ? err.message
            : `Unable to send command: ${command}`,
      })
    }
  }, [updateState])

  const enterIdentity = useCallback(() => {
    setState((prev) => ({
      ...prev,
      screen: 'identity',
      error: null,
      statusLine: prev.connected
        ? 'Enter your information.'
        : 'Connect the Arduino to begin.',
    }))
  }, [])

  const connectDevice = useCallback(async () => {
    try {
      updateState({
        error: null,
        statusLine: 'Connecting to Arduino...',
      })

      await kioskSerial.connect(9600)

      updateState({
        connected: true,
        error: null,
        statusLine: 'Device connected.',
      })

      await kioskSerial.sendLine('START')
    } catch (err) {
      updateState({
        connected: kioskSerial.isConnected,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to connect to Arduino.',
        statusLine: 'Unable to connect to device.',
      })
    }
  }, [updateState])

  // Send the exact calibration command expected by the Arduino sketch.
  const calibrateWeight = useCallback(async () => {
    if (!kioskSerial.isConnected) {
      updateState({
        error: 'Connect the Arduino first.',
        statusLine: 'Weight calibration requires a connected device.',
      })
      return
    }

    try {
      updateState({
        error: null,
        statusLine: 'Starting weight calibration...',
      })

      await kioskSerial.sendLine('CALIBRATE')

      updateState({
        statusLine:
          'Calibration command sent. Follow the instructions displayed by the Arduino.',
      })
    } catch (err) {
      updateState({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to start weight calibration.',
      })
    }
  }, [updateState])

  const answerConfirm = useCallback(
    async (answer: boolean) => {
      const response = answer ? 'Y' : 'N'

      await sendCommand(response)

      setState((prev) => {
        if (prev.promptKind === 'ready' && !answer) {
          return {
            ...initialState(),
            connected: kioskSerial.isConnected,
          }
        }

        return {
          ...prev,
          error: null,
          promptKind: null,
          statusLine: answer
            ? 'Continuing measurement...'
            : 'Please wait...',
        }
      })
    },
    [sendCommand]
  )

  const submitName = useCallback(
    async (name: string) => {
      const value = name.trim()

      if (!value) {
        updateState({ error: 'Please enter your name.' })
        return
      }

      await sendCommand(value)

      setState((prev) => ({
        ...prev,
        identity: { ...prev.identity, name: value },
        error: null,
        promptKind: null,
        statusLine: 'Name submitted.',
      }))
    },
    [sendCommand, updateState]
  )

  const submitAge = useCallback(
    async (age: string | number) => {
      const value = String(age).trim()
      const numericAge = Number(value)

      if (
        !value ||
        !Number.isInteger(numericAge) ||
        numericAge < 1 ||
        numericAge > 120
      ) {
        updateState({ error: 'Enter a valid age from 1 to 120.' })
        return
      }

      await sendCommand(value)

      setState((prev) => ({
        ...prev,
        identity: { ...prev.identity, age: value },
        error: null,
        promptKind: null,
        statusLine: 'Age submitted.',
      }))
    },
    [sendCommand, updateState]
  )

  const submitGender = useCallback(
    async (gender: 'M' | 'F') => {
      await sendCommand(gender)

      setState((prev) => ({
        ...prev,
        identity: {
          ...prev.identity,
          gender: gender === 'M' ? 'Male' : 'Female',
        },
        error: null,
        promptKind: null,
        statusLine: 'Gender submitted.',
      }))
    },
    [sendCommand]
  )

  const finish = useCallback(async () => {
    updateState({
      error: null,
      promptKind: null,
      statusLine: 'Finishing measurement...',
    })

    await sendCommand('Y')
  }, [sendCommand, updateState])

  useEffect(() => {
    return kioskSerial.onStatus((connected) => {
      setState((prev) => ({
        ...prev,
        connected,
        error: connected ? null : prev.error,
        statusLine: connected
          ? prev.statusLine
          : 'Device disconnected.',
      }))
    })
  }, [])

  useEffect(() => {
    const unsubscribe = kioskSerial.onLine((rawLine) => {
      const line = rawLine.trim()

      if (!line) return

      // Ignore weight-sensor startup and tare diagnostics.
      if (
        line.startsWith('Preparing weight sensor') ||
        line.startsWith('Make sure the platform is EMPTY') ||
        line.startsWith('HX711 tare complete') ||
        line.startsWith('Zero offset:')
      ) {
        return
      }

      // Do not reset the React interface on Arduino startup messages.
      if (
        line === 'SYSTEM READY' ||
        line === 'Send START to begin.' ||
        line === 'Send CALIBRATE to calibrate weight.'
      ) {
        setState((prev) => ({
          ...prev,
          connected: kioskSerial.isConnected,
          error: null,
          statusLine:
            line === 'SYSTEM READY'
              ? 'System ready.'
              : line === 'Send CALIBRATE to calibrate weight.'
                ? 'Arduino is ready for weight calibration.'
                : prev.statusLine,
        }))
        return
      }

      // Reset only when the Arduino explicitly ends the session.
      if (line === 'END COMMAND RECEIVED.') {
        setState({
          ...initialState(),
          connected: kioskSerial.isConnected,
          statusLine: 'Measurement session ended.',
        })
        return
      }

      // Arduino sensor-step messages, e.g. STEP 1: TEMPERATURE.
      const stepMatch = line.match(/^STEP\s*(\d+)\s*:\s*(.+)$/i)

      if (stepMatch) {
        const stepNumber = Number(stepMatch[1])
        const title = stepMatch[2].trim()

        setState((prev) => ({
          ...prev,
          screen: 'sensor',
          stepIndex: Math.max(0, stepNumber - 1),
          sectionTitle: title,
          statusLine: `Measuring ${title.toLowerCase()}...`,
          promptKind: null,
          error: null,
        }))
        return
      }

      if (/^FINAL RESULTS$/i.test(line)) {
        setState((prev) => ({
          ...prev,
          screen: 'results',
          sectionTitle: 'Final Results',
          statusLine: 'Measurement completed.',
          promptKind: null,
          error: null,
        }))
        return
      }

      if (/^MEASUREMENT COMPLETE\.?$/i.test(line)) {
        setState((prev) => ({
          ...prev,
          screen: 'results',
          sectionTitle: 'Final Results',
          statusLine: 'Measurement completed.',
          promptKind: null,
          error: null,
        }))
        return
      }

      // Identity information reported by the Arduino.
      const identityMatch = line.match(/^(NAME|AGE|GENDER)\s*:\s*(.*)$/i)

      if (identityMatch) {
        const field = identityMatch[1].toLowerCase()
        const value = identityMatch[2].trim()

        setState((prev) => ({
          ...prev,
          identity: {
            ...prev.identity,
            [field]:
              field === 'gender'
                ? value.toUpperCase() === 'M'
                  ? 'Male'
                  : value.toUpperCase() === 'F'
                    ? 'Female'
                    : value
                : value,
          },
        }))
        return
      }

      // Sensor/result lines, e.g. TEMP:36.7, WEIGHT:65.
      const resultMatch = line.match(/^([A-Z][A-Z0-9 _/-]*)\s*:\s*(.+)$/i)

      if (resultMatch) {
        const key = resultMatch[1].trim().toUpperCase()
        const value = resultMatch[2].trim()

        // Do not treat prompts as sensor measurements.
        if (
          /^(PROMPT|MESSAGE|STATUS|ERROR)$/.test(key)
        ) {
          setState((prev) => ({
            ...prev,
            statusLine: value,
          }))
          return
        }

        setState((prev) => {
          const results = { ...prev.results, [key]: value }

          let stepIndex = prev.stepIndex
          const normalizedKey = key.replace(/[_-]/g, ' ')

          const matchedStep = SENSOR_STEPS.findIndex((step) =>
            normalizedKey.includes(step)
          )

          if (matchedStep >= 0) stepIndex = matchedStep

          return {
            ...prev,
            results,
            stepIndex,
            statusLine: `${key}: ${value}`,
          }
        })
        return
      }

      // Prompts sent by the Arduino.
      const lowerLine = line.toLowerCase()

      if (
        lowerLine.includes('start measurement') ||
        lowerLine.includes('ready to start') ||
        lowerLine.includes('begin measurement')
      ) {
        setState((prev) => ({
          ...prev,
          screen: 'sensor',
          promptKind: 'ready',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (
        lowerLine.includes('retry') ||
        lowerLine.includes('try again')
      ) {
        setState((prev) => ({
          ...prev,
          promptKind: 'retry',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (
        lowerLine.includes('redo') ||
        lowerLine.includes('repeat measurement')
      ) {
        setState((prev) => ({
          ...prev,
          promptKind: 'redo',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (lowerLine.includes('enter name') || lowerLine.includes('your name')) {
        setState((prev) => ({
          ...prev,
          screen: 'identity',
          promptKind: 'name',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (lowerLine.includes('enter age') || lowerLine.includes('your age')) {
        setState((prev) => ({
          ...prev,
          screen: 'identity',
          promptKind: 'age',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (
        lowerLine.includes('select gender') ||
        lowerLine.includes('enter gender') ||
        lowerLine.includes('your gender')
      ) {
        setState((prev) => ({
          ...prev,
          screen: 'identity',
          promptKind: 'gender',
          statusLine: line,
          error: null,
        }))
        return
      }

      if (
        lowerLine.includes('finish') ||
        lowerLine.includes('save results') ||
        lowerLine.includes('end measurement')
      ) {
        setState((prev) => ({
          ...prev,
          screen: 'results',
          promptKind: 'finish',
          statusLine: line,
          error: null,
        }))
        return
      }

      // Show other Arduino messages without resetting the UI.
      setState((prev) => ({
        ...prev,
        statusLine: line,
      }))
    })

    return unsubscribe
  }, [])

  return {
    state,
    actions: {
      enterIdentity,
      connectDevice,
      calibrateWeight,
      answerConfirm,
      submitName,
      submitAge,
      submitGender,
      finish,
    },
  }
}
