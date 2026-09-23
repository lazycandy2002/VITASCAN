// Thin wrapper around the Web Serial API for talking to the Arduino Mega.
// The firmware speaks plain text lines at 9600 baud, so this class just
// turns the byte stream into lines and exposes a tiny pub/sub API.
//
// Web Serial only works in Chromium browsers (Chrome / Edge) served over
// HTTPS or http://localhost — perfect for a kiosk running in Chrome
// kiosk-mode on the device itself.

export type SerialLineHandler = (line: string) => void

export class KioskSerial {
  private port: SerialPort | null = null
  private textReader: ReadableStreamDefaultReader<string> | null = null
  private closed = true
  private lineHandlers = new Set<SerialLineHandler>()

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  get isConnected(): boolean {
    return this.port !== null
  }

  /** Subscribe to every line received from the device. Returns an unsubscribe fn. */
  onLine(handler: SerialLineHandler): () => void {
    this.lineHandlers.add(handler)
    return () => this.lineHandlers.delete(handler)
  }

  async connect(baudRate = 9600): Promise<void> {
    if (!this.isSupported) {
      throw new Error(
        'Web Serial is not supported in this browser. Use Chrome or Edge on desktop.'
      )
    }
    const port = await navigator.serial.requestPort()
    await port.open({ baudRate })
    this.port = port
    this.closed = false
    this.readLoop()
  }

  async disconnect(): Promise<void> {
    this.closed = true
    try {
      await this.textReader?.cancel()
    } catch {
      /* ignore */
    }
    this.textReader = null
    try {
      await this.port?.close()
    } catch {
      /* ignore */
    }
    this.port = null
  }

  async sendLine(text: string): Promise<void> {
    if (!this.port?.writable) return
    const writer = this.port.writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(text + '\n'))
    } finally {
      writer.releaseLock()
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return

    const decoderStream = new TextDecoderStream()
    const streamClosed = this.port.readable
      .pipeTo(decoderStream.writable)
      .catch(() => {
        /* closed on disconnect */
      })

    const reader = decoderStream.readable.getReader()
    this.textReader = reader

    let buffer = ''
    try {
      while (!this.closed) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue

        buffer += value
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).replace(/\r$/, '')
          buffer = buffer.slice(idx + 1)
          if (line.length > 0) {
            this.lineHandlers.forEach((h) => h(line))
          }
        }
      }
    } catch (err) {
      if (!this.closed) console.error('Serial read error:', err)
    } finally {
      reader.releaseLock()
      await streamClosed
    }
  }
}

// Single shared instance for the whole app.
export const kioskSerial = new KioskSerial()