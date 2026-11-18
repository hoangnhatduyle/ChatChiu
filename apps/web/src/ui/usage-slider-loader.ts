// Loads the react-aria slider chunk on demand (step 6.1, NC-AP-BUDGET). One shared store, so every
// row on the screen sees the same answer: when one retry succeeds, all of them become sliders.
import { createElement, type ReactElement } from 'react'
import type { UsageSliderProps } from './usage-slider-shared'

/** Draws the real slider; a function (not a component type) so a row can call it during render. */
export type RenderUsageSlider = (props: UsageSliderProps) => ReactElement

type Listener = () => void

let loaded: RenderUsageSlider | null = null
let loading: Promise<RenderUsageSlider> | null = null
let failures = 0
const listeners = new Set<Listener>()

const notify = () => listeners.forEach((listener) => listener())

export const subscribeUsageSlider = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getLoadedUsageSlider = () => loaded
/** How many loads in a row have failed (0 once one works). */
export const getUsageSliderFailures = () => failures

/** Starts (once) or joins the load of the real slider; after a failure it can be started again. */
export function loadUsageSlider(): Promise<RenderUsageSlider> {
  if (loaded) return Promise.resolve(loaded)
  loading ??= import('./UsageSliderImpl').then(
    (m) => {
      const Slider = m.UsageSliderImpl
      loaded = (props) => createElement(Slider, props)
      failures = 0
      notify()
      return loaded
    },
    (error: unknown) => {
      loading = null
      failures += 1
      console.warn('The usage slider chunk failed to load', error)
      notify()
      throw error
    },
  )
  return loading
}
