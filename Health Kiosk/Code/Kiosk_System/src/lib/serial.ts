
export type SerialLineHandler = (line: string) => void
export type SerialStatusHandler = (connected: boolean) => void

export class KioskSerial {
  private port: SerialPort | null = null
  private textReader: ReadableStreamDefaultReader<string> | null = null
  private closed = true
  private connecting = false

  private lineHandlers = new Set<SerialLineHandler>()
  private statusHandlers = new Set<SerialStatusHandler>()

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  get isConnected(): boolean {
    return this.port !== null && !this.closed
  }

  // Subscribe to incoming Arduino text lines.
  onLine(handler: SerialLineHandler): () => void {
    this.lineHandlers.add(handler)

    return () => {
      this.lineHandlers.delete(handler)
    }
  }

  // Subscribe to connection status changes.
  onStatus(handler: SerialStatusHandler): () => void {
    this.statusHandlers.add(handler)

    return () => {
      this.statusHandlers.delete(handler)
    }
  }

  private notifyStatus(connected: boolean): void {
    this.statusHandlers.forEach((handler) => {
      try {
        handler(connected)
      } catch (error) {
        console.error('Serial status handler error:', error)
      }
    })
  }

  // Connect to the Arduino Mega.
  async connect(baudRate = 9600): Promise<void> {
    if (!this.isSupported) {
      throw new Error(
        'Web Serial is not supported in this browser. Use Chrome or Edge on desktop.'
      )
    }

    if (this.connecting) {
      throw new Error('A connection attempt is already in progress.')
    }

    if (this.isConnected) {
      return
    }

    this.connecting = true

    try {
      const port = await navigator.serial.requestPort()

      await port.open({ baudRate })

      this.port = port
      this.closed = false

      this.notifyStatus(true)

      // Start reading without blocking the connection button.
      void this.readLoop(port)
    } finally {
      this.connecting = false
    }
  }

  // Disconnect from the Arduino.
  async disconnect(): Promise<void> {
    const port = this.port

    this.closed = true
    this.port = null

    try {
      await this.textReader?.cancel()
    } catch {
      // Reader may already be closed.
    }

    this.textReader = null

    try {
      await port?.close()
    } catch {
      // Port may already be closed.
    }

    this.notifyStatus(false)
  }

  // Send one newline-terminated command to the Arduino.
  async sendLine(text: string): Promise<void> {
    const port = this.port

    if (!port?.writable || this.closed) {
      throw new Error('Arduino is not connected.')
    }

    const writer = port.writable.getWriter()

    try {
      await writer.write(
        new TextEncoder().encode(`${text}\n`)
      )
    } finally {
      writer.releaseLock()
    }
  }

  // Continuously read incoming text and split it into lines.
  private async readLoop(port: SerialPort): Promise<void> {
    if (!port.readable) {
      this.closed = true
      this.port = null
      this.notifyStatus(false)
      return
    }

    const decoderStream = new TextDecoderStream()

    const streamClosed = port.readable
      .pipeTo(decoderStream.writable as WritableStream<Uint8Array<ArrayBufferLike>>
      )
      .catch(() => {
        // Expected when the port closes or disconnects.
      })

    const reader = decoderStream.readable.getReader()
    this.textReader = reader

    let buffer = ''

    try {
      while (!this.closed && this.port === port) {
        const { value, done } = await reader.read()

        if (done) break
        if (!value) continue

        buffer += value

        let index: number

        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer
            .slice(0, index)
            .replace(/\r$/, '')

          buffer = buffer.slice(index + 1)

          if (line.length === 0) continue

          this.lineHandlers.forEach((handler) => {
            try {
              handler(line)
            } catch (error) {
              console.error('Serial line handler error:', error)
            }
          })
        }
      }
    } catch (error) {
      if (!this.closed) {
        console.error('Serial read error:', error)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // Reader may already be released.
      }

      await streamClosed

      if (this.textReader === reader) {
        this.textReader = null
      }

      // Mark disconnected only if this was the active port
      // and the read loop ended unexpectedly.
      if (!this.closed && this.port === port) {
        this.closed = true
        this.port = null
        this.notifyStatus(false)

        try {
          await port.close()
        } catch {
          // Port may already be closed.
        }
      }
    }
  }
}

// One shared serial instance for the whole application.
export const kioskSerial = new KioskSerial()
