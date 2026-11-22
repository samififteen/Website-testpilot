import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom does not implement EventSource; tests that need streaming override this.
class MockEventSource {
  static instances: MockEventSource[] = []
  url: string
  listeners: Record<string, ((event: MessageEvent<string>) => void)[]> = {}
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener]
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>
    ;(this.listeners[type] ?? []).forEach((listener) => listener(event))
  }
}

vi.stubGlobal('EventSource', MockEventSource)

// jsdom has no matchMedia; components use it for reduced-motion checks.
if (typeof window.matchMedia !== 'function') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
vi.stubGlobal('scrollTo', vi.fn())
Element.prototype.scrollIntoView = vi.fn()

// Recharts needs a measurable container in jsdom.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 })
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 })
