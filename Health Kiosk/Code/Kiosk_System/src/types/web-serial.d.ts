export {}

declare global {
  interface SerialPort {
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
    open(options: { baudRate: number }): Promise<void>
    close(): Promise<void>
  }

  interface Serial extends EventTarget {
    requestPort(options?: {
      filters?: Array<{ usbVendorId?: number; usbProductId?: number }>
    }): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }

  interface Navigator {
    serial: Serial
  }
}