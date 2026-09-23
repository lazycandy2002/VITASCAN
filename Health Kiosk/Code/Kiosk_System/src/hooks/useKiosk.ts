import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskSerial } from '../lib/serial'

export type Screen = 'splash' | 'identity' | 'sensor' | 'results'

export type PromptKind =
  | 'ready' // "Ready to start? Send Y or N."
  | 'retry' // "Try again? Send Y or N."
  | 'redo' // "Redo this step? Send Y or N."
  | 'name'
  | 'age'
  | 'gender'
  | 'finish' // "Send END when finished."
  | null

export interface KioskState {
  screen: Screen
  connected: boolean
  error: string | null
  sectionTitle: string
  statusLine: string
  promptKind: PromptKind
  identity: { name: string; age: string; gender: string }
  results: Record<string, string>
  stepIndex: number // 1..5 while on the sensor screen, else 0
}

const SENSOR_STEPS = ['TEMPERATURE', 'PULSE RATE', 'OXYGEN', 'HEIGHT', 'WEIGHT']

function makeInitialState(connected: boolean): KioskState {
  return {
    screen: 'splash',
    connected,
    error: null,
    sectionTitle: '',
    statusLine: '',
    promptKind: null,
    identity: { name: '', age: '', gender: '' },
    results: {},
    stepIndex: 0,
  }
}

export function useKiosk() {
  const [state, setState] = useState<KioskState>(() => makeInitialState(false))
  const collectingResults = useRef(false)

  useEffect(() => {
    const unsubscribe = kioskSerial.onLine(handleLine)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLine = useCallback((line: string) => {
    setState((prev) => {
      const next: KioskState = { ...prev }

      // "STEP N: TITLE" — section header printed before every step.
      const stepMatch = line.match(/^STEP (\d+): (.+)$/)
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

      if (line.trim() === 'FINAL RESULTS') {
        collectingResults.current = true
        next.screen = 'results'
        next.results = {}
        next.promptKind = null
        return next
      }

      if (collectingResults.current) {
        if (line === 'MEASUREMENT COMPLETE') {
          collectingResults.current = false
          return next
        }
        const kv = line.match(/^([A-Z_]+): (.+)$/)
        if (kv) {
          next.results = { ...next.results, [kv[1]]: kv[2] }
          return next
        }
      }

      switch (line) {
        case 'Ready to start? Send Y or N.':
          next.promptKind = 'ready'
          return next
        case 'Try again? Send Y or N.':
          next.promptKind = 'retry'
          return next
        case 'Redo this step? Send Y or N.':
          next.promptKind = 'redo'
          return next
        case 'Type your name and press Enter.':
          next.promptKind = 'name'
          return next
        case 'Type your age (years) and press Enter.':
          next.promptKind = 'age'
          return next
        case 'Send M for Male or F for Female.':
          next.promptKind = 'gender'
          return next
        case 'Send END when finished.':
          next.promptKind = 'finish'
          return next
        default:
          break
      }

      if (line.startsWith('NAME: ')) {
        next.identity = { ...next.identity, name: line.slice(6) }
        return next
      }
      if (line.startsWith('AGE: ')) {
        next.identity = { ...next.identity, age: line.slice(5) }
        return next
      }
      if (line.startsWith('GENDER: ')) {
        next.identity = { ...next.identity, gender: line.slice(8) }
        return next
      }

      // Printed at boot and again after a full completed cycle
      // (waitForEnd -> END). A test cancelled mid-way via "N" on a
      // readiness gate does NOT reprint this, so that case is handled
      // client-side in answerConfirm below.
      if (line === 'SYSTEM READY' || line === 'END COMMAND RECEIVED.') {
        return makeInitialState(prev.connected)
      }

      // Anything else while a step is running is just live sensor/status
      // chatter (e.g. "Time: N seconds", "FINGER DETECTED...").
      if (!next.promptKind && (next.screen === 'sensor' || next.screen === 'identity')) {
        next.statusLine = line
      }

      return next
    })
  }, [])

  // Splash -> Identity is pure navigation; no serial call, so it never
  // needs a user gesture beyond the tap itself.
  const enterIdentity = useCallback(() => {
    setState((prev) => ({ ...prev, screen: 'identity' }))
  }, [])

  // The "Connect Device" button on the identity screen. Opens the port
  // (only if not already open) and (re)sends START either way, so the
  // same action also works for starting a fresh check-up on an
  // already-connected device.
  const connectDevice = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }))
    try {
      if (!kioskSerial.isConnected) {
        await kioskSerial.connect(9600)
        setState((prev) => ({ ...prev, connected: true }))
      }
      await kioskSerial.sendLine('START')
    } catch (err) {
      setState((prev) => ({ ...prev, error: (err as Error).message }))
    }
  }, [])

  const answerConfirm = useCallback((yes: boolean) => {
    kioskSerial.sendLine(yes ? 'Y' : 'N')
    setState((prev) => {
      // "N" on a readiness gate cancels the whole test on the firmware
      // side, with no further serial confirmation — reset immediately.
      if (!yes && prev.promptKind === 'ready') {
        return makeInitialState(prev.connected)
      }
      return { ...prev, promptKind: null }
    })
  }, [])

  const submitName = useCallback((value: string) => {
    kioskSerial.sendLine(value)
    setState((prev) => ({ ...prev, promptKind: null }))
  }, [])

  const submitAge = useCallback((value: string) => {
    kioskSerial.sendLine(value)
    setState((prev) => ({ ...prev, promptKind: null }))
  }, [])

  const submitGender = useCallback((value: 'M' | 'F') => {
    kioskSerial.sendLine(value)
    setState((prev) => ({ ...prev, promptKind: null }))
  }, [])

  const finish = useCallback(() => {
    kioskSerial.sendLine('END')
    setState((prev) => ({ ...prev, promptKind: null }))
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