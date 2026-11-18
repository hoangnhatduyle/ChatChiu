import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'
import { loadUsageSlider } from '../ui/usage-slider-loader'

// findBy and waitFor wait this long for things like a lazy page chunk to load. The default 1 s is enough
// alone but not when the whole suite runs in parallel on a busy machine (a first dynamic import is slow).
const ASYNC_UTIL_TIMEOUT_MS = 4000
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS })

afterEach(() => {
  cleanup()
})

// The slider chunk is lazy in the app (step 6.1); tests that are not about loading see it ready, as a warm app does.
await loadUsageSlider()
