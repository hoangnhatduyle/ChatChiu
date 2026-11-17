// Every ui/ component in its states, on the board's surfaces, for screenshots and real-pointer
// tests (e2e/ui/*.spec.ts). Sample data mirrors the approved prototype's board.
import { useState, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { DateField } from '../ui/DateField'
import { EmptyState } from '../ui/EmptyState'
import { ExpiryChip } from '../ui/ExpiryChip'
import { Field } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ResponsivePanel } from '../ui/ResponsivePanel'
import { Segmented } from '../ui/Segmented'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'
import { Toast } from '../ui/Toast'
import { UsageSlider } from '../ui/UsageSlider'

const TODAY = '2026-11-16'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}

function SliderDemo({
  name,
  mode,
  start,
  full,
  unit,
  size,
}: {
  name: string
  mode: 'down-only' | 'free'
  start: number
  full: number
  unit: string
  size?: 'row' | 'big'
}) {
  const [value, setValue] = useState(start)
  const [commits, setCommits] = useState<number[]>([])
  const left = Math.round(((full * value) / 100) * 10) / 10
  return (
    <div data-demo={name} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-ink">{name}</span>
        <span
          className={
            value <= 20 ? 'font-mono text-sm font-bold text-low' : 'font-mono text-sm text-muted'
          }
        >
          {value <= 20 && 'Low · '}
          {value}%
        </span>
      </div>
      <UsageSlider
        label={`How much ${name} is left`}
        description={`${left} of ${full} ${unit}`}
        value={value}
        mode={mode}
        size={size}
        tone={value <= 20 ? 'low' : 'normal'}
        onCommit={(v) => {
          setValue(v)
          setCommits((c) => [...c, v])
        }}
      />
      <output data-commits className="font-mono text-xs text-muted">
        {commits.length === 0 ? 'no saves' : `saved: ${commits.join(', ')}`}
      </output>
    </div>
  )
}

export function Gallery() {
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<'week' | 'month'>('week')
  const [location, setLocation] = useState<string | null>('fridge')
  const [expiry, setExpiry] = useState<string | null>(null)
  const [isPanelOpen, setPanelOpen] = useState(false)
  const [toastKey, setToastKey] = useState(0)
  const [toastOpen, setToastOpen] = useState(true)

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Chắt Chiu · UI kit</h1>
        <span className="font-mono text-sm text-muted">{TODAY}</span>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">
              <Icon name="plus" size={18} strokeWidth={2.4} />
              Add item
            </Button>
            <Button>
              <Icon name="scan" size={18} />
              Scan receipt
            </Button>
            <Button variant="ghost">Cancel</Button>
            <Button isDisabled>Saving…</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button shape="rounded" size="lg">
              Used 10%
            </Button>
            <Button shape="rounded" size="lg">
              Used it all
            </Button>
            <Button shape="rounded" size="lg" variant="primary">
              Add to shopping list
            </Button>
            <Button shape="rounded" size="lg" variant="danger">
              Move to waste
            </Button>
          </div>
          <div className="flex gap-2">
            <IconButton icon="plus" label="Add item to Fridge" />
            <IconButton icon="close" label="Close" variant="outline" />
            <IconButton icon="scan" label="Scan receipt" variant="outline" />
          </div>
        </Section>

        <Section title="Chips">
          <div className="flex flex-wrap gap-1.5">
            {[
              ['all', 'All', 24],
              ['soon', 'Use soon', 6],
              ['low', 'Running low', 3],
              ['used', 'Used up', 1],
            ].map(([id, label, count]) => (
              <Chip
                key={id}
                label={String(label)}
                count={Number(count)}
                isSelected={filter === id}
                onChange={() => setFilter(String(id))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExpiryChip expirationDate="2026-11-15" today={TODAY} />
            <ExpiryChip expirationDate="2026-11-16" today={TODAY} />
            <ExpiryChip expirationDate="2026-11-18" today={TODAY} />
            <ExpiryChip expirationDate="2026-12-07" today={TODAY} />
            <ExpiryChip expirationDate="2027-02-14" today={TODAY} />
            <ExpiryChip expirationDate={null} today={TODAY} />
          </div>
          <Segmented
            label="Meal view"
            value={view}
            onChange={setView}
            options={[
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
            ]}
          />
        </Section>

        <Section title="Usage bars">
          <SliderDemo name="Whole milk" mode="down-only" start={60} full={1} unit="L" />
          <SliderDemo name="Butter" mode="down-only" start={15} full={250} unit="g" />
          <SliderDemo name="Jasmine rice" mode="free" start={40} full={5} unit="kg" size="big" />
        </Section>

        <Section title="Form">
          <Field label="Name" placeholder="e.g. Whole milk" />
          <Field label="Quantity" defaultValue="0" isInvalid errorMessage="Enter more than 0" />
          <Select
            label="Stored in"
            value={location}
            onChange={setLocation}
            options={[
              { id: 'fridge', label: 'Fridge' },
              { id: 'freezer', label: 'Freezer' },
              { id: 'pantry', label: 'Pantry' },
              { id: 'counter', label: 'Counter' },
            ]}
          />
          <DateField label="Expires" value={expiry} onChange={setExpiry} quickFrom={TODAY} />
        </Section>

        <Section title="Panel and toast">
          <Button variant="primary" onPress={() => setPanelOpen(true)}>
            Open Whole milk
          </Button>
          <div className="rounded-card bg-bg p-3">
            {toastOpen ? (
              <Toast
                key={toastKey}
                message="Whole milk 60% → 35%"
                actions={[{ label: 'Undo', onPress: () => setToastOpen(false) }]}
                onClose={() => setToastOpen(false)}
                durationMs={600_000}
              />
            ) : (
              <Button
                onPress={() => {
                  setToastKey((k) => k + 1)
                  setToastOpen(true)
                }}
              >
                Show toast again
              </Button>
            )}
          </div>
          <Toast
            tone="error"
            message="Couldn't save"
            actions={[{ label: 'Retry', onPress: () => {} }]}
            onClose={() => {}}
            durationMs={600_000}
          />
        </Section>

        <Section title="Empty and loading">
          <EmptyState
            icon="box"
            title="Your kitchen is empty"
            action={{ label: 'Add first item', onPress: () => {} }}
          >
            Add what's in the fridge and pantry to start tracking it.
          </EmptyState>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-4/5" />
          </div>
        </Section>
      </div>

      <ResponsivePanel
        isOpen={isPanelOpen}
        onOpenChange={setPanelOpen}
        title="Whole milk"
        eyebrow="Fridge · Expires in 6 days"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-card bg-bg p-4">
            <SliderDemo name="Whole milk" mode="free" start={60} full={1} unit="L" size="big" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button shape="rounded" size="lg">
              Used 10%
            </Button>
            <Button shape="rounded" size="lg">
              Used 25%
            </Button>
            <Button shape="rounded" size="lg" variant="primary">
              Add to shopping list
            </Button>
            <Button shape="rounded" size="lg" variant="danger">
              Move to waste
            </Button>
          </div>
        </div>
      </ResponsivePanel>
    </main>
  )
}
