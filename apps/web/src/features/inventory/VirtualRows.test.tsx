// F-IN-06: the rendered window follows the page scroll. This once failed silently under the React
// Compiler (the component cached the virtualizer's answers); scrolling in a test is what catches it.
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VirtualRows } from './VirtualRows'
import type { ListRow } from './virtual-rows'

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('VirtualRows', () => {
  it('F-IN-06: scrolling the window moves the rendered rows', () => {
    const rows: ListRow[] = Array.from({ length: 300 }, (_, i) => ({
      kind: 'header',
      key: `k${i}`,
      groupKey: null,
      label: `Row ${i}`,
      count: 1,
    }))
    render(
      <VirtualRows
        rows={rows}
        role="list"
        heightOf={() => 60}
        renderRow={(r) => <span>{r.kind === 'header' ? r.label : ''}</span>}
      />,
    )
    const first = () => screen.getAllByText(/^Row /)[0]!.textContent
    expect(first()).toBe('Row 0')
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 6000, configurable: true })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(first()).not.toBe('Row 0')
  })
})
