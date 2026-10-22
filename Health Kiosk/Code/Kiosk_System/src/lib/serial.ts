export type SerialLineHandler = (line: string) => void
export type SerialStatusHandler = (connected: boolean) => void

// Must match Serial.begin(115200) in the Arduino sketch
const BAUD_RATE = 115200

export class KioskSerial {
    private port: SerialPort | null = null
    private reader: ReadableStreamDefaultReader<string> | null = null
    private closed = true
    private connecting = false
    private readTask: Promise<void> | null = null

    private lineHandlers = new Set<SerialLineHandler>()
    private statusHandlers = new Set<SerialStatusHandler>()

    get isConnected() {
        return this.port !== null && !this.closed
    }

    onLine(handler: SerialLineHandler) {
        this.lineHandlers.add(handler)
        return () => this.lineHandlers.delete(handler)
    }

    onStatus(handler: SerialStatusHandler) {
        this.statusHandlers.add(handler)
        return () => this.statusHandlers.delete(handler)
    }

    private emitStatus(connected: boolean) {
        for (const handler of this.statusHandlers) {
            handler(connected)
        }
    }

    private emitLine(line: string) {
        const value = line.trim()
        if (!value) return

        console.log('[Arduino]', value)

        for (const handler of this.lineHandlers) {
            handler(value)
        }
    }

    async connect() {
        if (this.connecting || this.isConnected) return

        if (!('serial' in navigator)) {
            throw new Error(
                'Web Serial is not supported. Use Chrome or Edge over localhost or HTTPS.',
            )
        }

        this.connecting = true

        try {
            const port = await navigator.serial.requestPort()
            await port.open({ baudRate: BAUD_RATE })

            if (!port.readable || !port.writable) {
                await port.close()
                throw new Error('The selected serial port is unavailable.')
            }

            this.port = port
            this.closed = false
            this.emitStatus(true)

            this.readTask = this.readLoop(port)
        } finally {
            this.connecting = false
        }
    }

    private async readLoop(port: SerialPort) {
        const decoder = new TextDecoderStream()
        const closedPromise = port.readable!
            .pipeTo(decoder.writable as WritableStream<Uint8Array>)
            .catch((error: unknown) => {
                if (!this.closed) {
                    console.error('Serial stream error:', error)
                }
            })

        const reader = decoder.readable.getReader()
        this.reader = reader

        let buffer = ''

        try {
            while (!this.closed) {
                const { value, done } = await reader.read()

                if (done) break
                if (value === undefined) continue

                buffer += value

                let newlineIndex = buffer.indexOf('\n')

                while (newlineIndex >= 0) {
                    const line = buffer.slice(0, newlineIndex)
                    buffer = buffer.slice(newlineIndex + 1)

                    this.emitLine(line.replace(/\r/g, ''))
                    newlineIndex = buffer.indexOf('\n')
                }

                if (buffer.length > 8192) {
                    buffer = buffer.slice(-4096)
                }
            }
        } catch (error) {
            if (!this.closed) {
                console.error('Serial read failed:', error)
            }
        } finally {
            if (this.reader === reader) {
                this.reader = null
            }

            try {
                reader.releaseLock()
            } catch {
                // Reader may already have been released.
            }

            await closedPromise

            if (this.port === port) {
                this.port = null
                this.closed = true
                this.emitStatus(false)
            }
        }
    }

    async sendLine(command: string) {
        if (!this.port || this.closed || !this.port.writable) {
            throw new Error('Arduino is not connected.')
        }

        const writer = this.port.writable.getWriter()

        try {
            const encoder = new TextEncoder()
            await writer.write(encoder.encode(`${command}\n`))
        } finally {
            writer.releaseLock()
        }
    }

    async disconnect() {
        const port = this.port

        if (!port) return

        this.closed = true

        try {
            await this.reader?.cancel()
        } catch {
            // The read loop may already have stopped.
        }

        try {
            await this.readTask
        } catch {
            // Connection is already closing.
        }

        try {
            await port.close()
        } catch (error) {
            console.warn('Serial port close:', error)
        }

        this.port = null
        this.reader = null
        this.readTask = null
        this.emitStatus(false)
    }
}

export const kioskSerial = new KioskSerial()