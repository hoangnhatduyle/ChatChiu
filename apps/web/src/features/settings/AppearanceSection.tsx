// Appearance (F-SE-06): System, Light or Dark. The preferences write is optimistic, so the shell's ThemeSync
// applies the choice at once; it persists with her other preferences.
import type { Theme } from '@chatchiu/contracts'
import { updatePreferences, usePreferencesQuery } from '../../data/preferences'
import { useWrite } from '../../data/write'
import { Segmented } from '../../ui/Segmented'
import { SectionCard } from './SectionCard'

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const satisfies ReadonlyArray<{ id: Theme; label: string }>

export function AppearanceSection() {
  const theme = usePreferencesQuery().data?.theme
  const save = useWrite(updatePreferences)
  return (
    <SectionCard title="Appearance" description="System follows your device.">
      {theme ? (
        <Segmented
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={(next) => void save({ theme: next })}
        />
      ) : null}
    </SectionCard>
  )
}
