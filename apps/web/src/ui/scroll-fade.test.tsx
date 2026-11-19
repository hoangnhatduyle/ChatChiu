// UI refresh foundation: ScrollFade shows a fade and a "N more" pill only while content remains.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ScrollFade } from './ScrollFade'

function setMetrics(
  el: HTMLElement,
  m: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  for (const [key, value] of Object.entries(m)) {
    Object.defineProperty(el, key, { configurable: true, writable: true, value })
  }
}

describe('ScrollFade', () => {
  it('is a labelled region the keyboard can reach', () => {
    render(
      <ScrollFade label="Freezer items">
        <p>row</p>
      </ScrollFade>,
    )
    const region = screen.getByRole('region', { name: 'Freezer items' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveClass('scroll-quiet')
  })

  it('shows the end fade and the pill while more remains, and drops them at the end', () => {
    const { container } = render(
      <ScrollFade label="List" moreLabel="5 more">
        <p>row</p>
      </ScrollFade>,
    )
    const region = screen.getByRole('region', { name: 'List' })
    act(() => {
      setMetrics(region, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 })
      fireEvent.scroll(region)
    })
    expect(screen.getByText('5 more')).toBeInTheDocument()
    expect(container.querySelector('[data-fade="start"]')).toBeNull()
    act(() => {
      setMetrics(region, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
      fireEvent.scroll(region)
    })
    expect(screen.queryByText('5 more')).toBeNull()
    expect(container.querySelector('[data-fade="start"]')).not.toBeNull()
    expect(container.querySelector('[data-fade="end"]')).toBeNull()
  })

  it('the fade and pill are hidden from assistive tech and never take pointer events', () => {
    const { container } = render(
      <ScrollFade label="List" moreLabel="2 more">
        <p>row</p>
      </ScrollFade>,
    )
    const region = screen.getByRole('region', { name: 'List' })
    act(() => {
      setMetrics(region, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 })
      fireEvent.scroll(region)
    })
    for (const el of container.querySelectorAll('[data-fade], [data-more-pill]')) {
      expect(el).toHaveAttribute('aria-hidden', 'true')
      expect(el).toHaveClass('pointer-events-none')
    }
  })
})
