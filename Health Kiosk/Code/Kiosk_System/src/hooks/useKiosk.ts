
import { useCallback, useEffect, useRef, useState } from 'react'
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

function makeInitialState(connected: boolean): KioskState {
  return {
    screen: 'splash',
    connected,
    error: null,
    sectionTitle: '',
    statusLine: '',
    promptKind: null,
    identity: {
      name: '',
      age: '',
      gender: '',
    },
    results: {},
    stepIndex: 0,
  }
}

// Arduino startup and diagnostic messages that should not
// appear as live status messages in the React interface.
function isIgnoredStartupMessage(line: string): boolean {
  const message = line.trim()

  const ignoredMessages = [
    'Preparing weight sensor...',
    'Make sure the platform is EMPTY.',
    'HX711 tare complete.',
  ]

  if (ignoredMessages.includes(message)) {
    return true
  }

  // Ignore the changing zero offset diagnostic.
  if (message.startsWith('Zero offset: ')) {
    return true
  }

  return false
}

export function useKiosk() {
  const [state, setState] = useState<KioskState>(() =>
    makeInitialState(false)
  )

  const collectingResults = useRef(false)

  const handleLine = useCallback((line: string) => {
    const message = line.trim()

    // Ignore empty lines and selected Arduino startup logs.
    if (!message || isIgnoredStartupMessage(message)) {
      return
    }

    setState((prev) => {
      const next: KioskState = { ...prev }

      // STEP N: TITLE
      const stepMatch = message.match(/^STEP (\d+): (.+)$/)

      if (stepMatch) {
        const num = Number(stepMatch[1])
        const title = stepMatch[2].trim()

        next.sectionTitle = title
        next.promptKind = null
        next.statusLine = ''

        if (num === 0) {
          next.screen = 'identity'
          next.stepIndex = 0
        } else {
          next.screen = 'sensor'

          const idx = SENSOR_STEPS.indexOf(title)

          next.stepIndex = idx >= 0 ? idx + 1 : num
        }

        return next
      }

      // Final measurement results begin.
      if (message === 'FINAL RESULTS') {
        collectingResults.current = true

        next.screen = 'results'
        next.results = {}
        next.promptKind = null
        next.statusLine = ''

        return next
      }

      // Read result lines until measurement completion.
      if (collectingResults.current) {
        if (message === 'MEASUREMENT COMPLETE') {
          collectingResults.current = false
          return next
        }

        const kv = message.match(/^([A-Z_]+): (.+)$/)

        if (kv) {
          next.results = {
            ...next.results,
            [kv[1]]: kv[2],
          }

          return next
        }
      }

      // Arduino interaction prompts.
      switch (message) {
        case 'Ready to start? Send Y or N.':
          next.promptKind = 'ready'
          next.statusLine = ''
          return next

        case 'Try again? Send Y or N.':
          next.promptKind = 'retry'
          next.statusLine = ''
          return next

        case 'Redo this step? Send Y or N.':
          next.promptKind = 'redo'
          next.statusLine = ''
          return next

        case 'Type your name and press Enter.':
          next.promptKind = 'name'
          next.statusLine = ''
          return next

        case 'Type your age (years) and press Enter.':
          next.promptKind = 'age'
          next.statusLine = ''
          return next

        case 'Send M for Male or F for Female.':
          next.promptKind = 'gender'
          next.statusLine = ''
          return next

        case 'Send END when finished.':
          next.promptKind = 'finish'
          next.statusLine = ''
          return next

        default:
          break
      }

      // Identity information.
      if (message.startsWith('NAME: ')) {
        next.identity = {
          ...next.identity,
          name: message.slice(6),
        }

        return next
      }

      if (message.startsWith('AGE: ')) {
        next.identity = {
          ...next.identity,
          age: message.slice(5),
        }

        return next
      }

      if (message.startsWith('GENDER: ')) {
        next.identity = {
          ...next.identity,
          gender: message.slice(8),
        }

        return next
      }

      // Arduino startup and completed-cycle messages.
      if (
        message === 'SYSTEM READY' ||
        message === 'END COMMAND RECEIVED.'
      ) {
        collectingResults.current = false

        return makeInitialState(prev.connected)
      }

      // Other diagnostic chatter is ignored while the splash
      // screen is active. During the identity or sensor screen,
      // useful live measurement messages remain visible.
      if (
        !next.promptKind &&
        (next.screen === 'sensor' ||
          next.screen === 'identity')
      ) {
        next.statusLine = message
      }

      return next
    })
  }, [])

  useEffect(() => {
    const unsubscribe = kioskSerial.onLine(handleLine)

    return unsubscribe
  }, [handleLine])

  // Navigate from splash to identity.
  const enterIdentity = useCallback(() => {
    setState((prev) => ({
      ...prev,
      screen: 'identity',
      error: null,
    }))
  }, [])

  // Connect to Arduino if needed, then send START.
  const connectDevice = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      error: null,
    }))

    try {
      if (!kioskSerial.isConnected) {
        await kioskSerial.connect(9600)

        setState((prev) => ({
          ...prev,
          connected: true,
          error: null,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          connected: true,
        }))
      }

      collectingResults.current = false

      await kioskSerial.sendLine('START')
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connected: kioskSerial.isConnected,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to connect to Arduino.',
      }))
    }
  }, [])

  // Answer readiness, retry, or redo prompts.
  const answerConfirm = useCallback((yes: boolean) => {
    setState((prev) => {
      // N on the initial readiness prompt cancels the test.
      if (!yes && prev.promptKind === 'ready') {
        collectingResults.current = false

        return makeInitialState(prev.connected)
      }

      return {
        ...prev,
        promptKind: null,
      }
    })

    void kioskSerial.sendLine(yes ? 'Y' : 'N')
  }, [])

  // Submit user name.
  const submitName = useCallback((value: string) => {
    const name = value.trim()

    if (!name) {
      setState((prev) => ({
        ...prev,
        error: 'Please enter your name.',
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        name,
      },
      promptKind: null,
      error: null,
    }))

    void kioskSerial.sendLine(name)
  }, [])

  // Submit user age.
  const submitAge = useCallback((value: string) => {
    const age = value.trim()
    const parsedAge = Number(age)

    if (
      !age ||
      !Number.isInteger(parsedAge) ||
      parsedAge <= 0 ||
      parsedAge > 120
    ) {
      setState((prev) => ({
        ...prev,
        error: 'Please enter a valid age.',
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      identity: {
        ...prev.identity,
        age,
      },
      promptKind: null,
      error: null,
    }))

    void kioskSerial.sendLine(age)
  }, [])

  // Submit gender.
  const submitGender = useCallback(
    (value: 'M' | 'F') => {
      const gender = value === 'M' ? 'Male' : 'Female'

      setState((prev) => ({
        ...prev,
        identity: {
          ...prev.identity,
          gender,
        },
        promptKind: null,
        error: null,
      }))

      void kioskSerial.sendLine(value)
    },
    []
  )

  // Finish the measurement cycle.
  const finish = useCallback(() => {
    setState((prev) => ({
      ...prev,
      promptKind: null,
      error: null,
    }))

    void kioskSerial.sendLine('END')
  }, [])

  return {
    state,
    actions: {
      enterIdentity,
      connectDevice,
      answerConfirm,
      submitName,
      submitAge,
      submitGender,
      finish,
    },
  }
}
