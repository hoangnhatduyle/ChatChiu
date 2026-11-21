// The meal plan (SPEC-MP-001, route /meals): week and month calendars, the meal dialog, drop to copy,
// the recipe library, the summary and suggestions. Reads and writes only through the data hooks
// (AR-NO-DIRECT-API). The tab and the day are in the URL (CS-STATE-HOMES), so Back and a refresh keep them.
import { lazyRetry } from '../../core/lazy-retry'
import type { MealPlan, Recipe } from '@chatchiu/contracts'
import { addDays, shiftMonth, weekStartMonday, type MealSlotType } from '@chatchiu/domain'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBootstrapQuery } from '../../data/inventory'
import { useMealsQuery } from '../../data/meals'
import { useRecipesQuery, useRecipeSuggestionsQuery } from '../../data/recipes'
import { PAGE_FRAME } from '../../shell/page-frame'
import { PageHeader } from '../../shell/PageHeader'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { Segmented } from '../../ui/Segmented'
import { Skeleton } from '../../ui/Skeleton'
import { dayLabel, MEAL_TYPE_LABEL, monthLabel, weekRangeLabel } from './format'
import { useToday } from '../../core/use-today'
import { useToast } from '../../core/toast-context'
import { PanelLoadBoundary } from '../item-panel/PanelLoadBoundary'
import type { MealDialogTarget } from './MealDialog'
import { MealSummary } from './MealSummary'
import { mealsSearch, parseMealsParams, TABS, type MealsTab } from './meals-params'
import { MonthGrid } from './MonthGrid'
import { RecipeLibrary } from './RecipeLibrary'
import { RecipeSuggestions } from './RecipeSuggestions'
import { ReplacePrompt } from './ReplacePrompt'
import { useMealActions, type MealDraft } from './use-meal-actions'
import { WeekGrid } from './WeekGrid'

// The dialog carries the date field and pickers (about 90 KB): its own chunk, fetched when it is first opened.
const MealDialog = lazyRetry(() => import('./MealDialog'))

const TAB_LABEL: Record<MealsTab, string> = {
  week: 'Week',
  month: 'Month',
  recipes: 'Recipes',
  summary: 'Summary',
}
const TAB_OPTIONS = TABS.map((id) => ({ id, label: TAB_LABEL[id] }))
const DAYS_IN_WEEK = 7
const DEFAULT_TYPE: MealSlotType = 'dinner'

type Conflict = { existingId: number; draft: MealDraft }

export default function MealsPage() {
  const [params, setParams] = useSearchParams()
  const today = useToday()
  const { tab, date } = parseMealsParams(params, today)
  const toasts = useToast()
  const query = useMealsQuery()
  const recipes = useRecipesQuery().data ?? []
  const suggestions = useRecipeSuggestionsQuery().data
  const items = useBootstrapQuery().data?.items
  const plans = query.data
  const actions = useMealActions(plans ?? [])
  const [dialog, setDialog] = useState<{ target: MealDialogTarget } | { editId: number } | null>(
    null,
  )
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const go = (nextTab: MealsTab, nextDate: string) =>
    setParams(new URLSearchParams(mealsSearch(nextTab, nextDate, today)))

  const frame = (children: React.ReactNode, actions?: React.ReactNode) => (
    <div className={PAGE_FRAME}>
      <PageHeader
        title="Meals"
        subtitle="Plan the week around what you already have"
        actions={actions}
      />
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
  if (!plans) {
    return frame(
      query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load your meal plan. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading your meal plan" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ),
    )
  }

  const editing =
    dialog && 'editId' in dialog ? plans.find((p) => p.id === dialog.editId) : undefined
  const dialogTarget: MealDialogTarget | null = dialog
    ? 'target' in dialog
      ? dialog.target
      : editing
        ? { kind: 'edit', plan: editing }
        : null // the meal was deleted (or undone away) while its dialog was open
    : null
  const existing = conflict ? plans.find((p) => p.id === conflict.existingId) : undefined

  const add = (draft: MealDraft) =>
    void actions.add(draft).then((outcome) => {
      if (outcome.status === 'conflict') setConflict({ existingId: outcome.existingId, draft })
    })
  const drop = (plan: MealPlan, planDate: string, type: MealSlotType) => {
    const isOwnSlot = plan.planDate === planDate && plan.mealType === type
    const isTaken = plans.some((p) => p.planDate === planDate && p.mealType === type)
    // Say the result at once (a drop has no other feedback for a screen reader); a taken slot asks first.
    if (!isOwnSlot && !isTaken)
      toasts.show({
        message: `${plan.mealName} copied to ${MEAL_TYPE_LABEL[type]} on ${dayLabel(planDate)}`,
      })
    void actions.copyTo(plan, planDate, type).then((outcome) => {
      if (outcome.status === 'conflict')
        setConflict({ existingId: outcome.existingId, draft: outcome.draft })
    })
  }
  // Replace waits until the meal in the way is known and saved (a server 409 can name one this screen has not loaded yet).
  const canReplace = existing !== undefined && existing.id > 0
  const replace = () => {
    if (!conflict || !canReplace) return
    void actions.replace(conflict.existingId, conflict.draft)
    setConflict(null)
  }
  const openEdit = (plan: MealPlan) => {
    // A meal still being created has no real id yet: its dialog could not save (7.0.20a).
    if (plan.id < 0) {
      toasts.show({ message: 'This is still being saved. Try again in a moment.', tone: 'error' })
      return
    }
    setDialog({ editId: plan.id })
  }
  const planRecipe = (recipe: Recipe) =>
    setDialog({ target: { kind: 'add', date, type: DEFAULT_TYPE, recipe } })

  const step = (days: number) => go(tab, addDays(date, days))
  const monthStep = (delta: number) => go(tab, shiftMonth(date, delta))
  const weekStart = weekStartMonday(date)

  return frame(
    <>
      {query.isError && (
        <p role="alert" className="text-md font-semibold text-status-soon-fg">
          Couldn&apos;t refresh. You are seeing what was saved on this device.
        </p>
      )}
      <RecipeSuggestions suggestions={suggestions} onPlan={planRecipe} />

      {(tab === 'week' || tab === 'month') && (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            icon="chevron-left"
            label={tab === 'week' ? 'Previous week' : 'Previous month'}
            variant="outline"
            onPress={() => (tab === 'week' ? step(-DAYS_IN_WEEK) : monthStep(-1))}
          />
          <h2 className="min-w-40 text-center text-lg font-extrabold">
            {tab === 'week' ? weekRangeLabel(weekStart) : monthLabel(date)}
          </h2>
          <IconButton
            icon="chevron-right"
            label={tab === 'week' ? 'Next week' : 'Next month'}
            variant="outline"
            onPress={() => (tab === 'week' ? step(DAYS_IN_WEEK) : monthStep(1))}
          />
          <Button onPress={() => go(tab, today)}>Today</Button>
        </div>
      )}
      {tab === 'week' && (
        <WeekGrid
          date={date}
          today={today}
          plans={plans}
          onAdd={(t) => setDialog({ target: { kind: 'add', date: t.date, type: t.type } })}
          onOpen={openEdit}
          onDrop={drop}
        />
      )}
      {tab === 'month' && (
        <MonthGrid date={date} today={today} plans={plans} onPickDay={(day) => go('week', day)} />
      )}
      {tab === 'recipes' && (
        <>
          <h2 className="sr-only">Recipes</h2>
          <RecipeLibrary recipes={recipes} items={items} today={today} onPlan={planRecipe} />
        </>
      )}
      {tab === 'summary' && (
        <>
          <h2 className="sr-only">Summary</h2>
          <MealSummary plans={plans} today={today} onOpen={openEdit} />
        </>
      )}

      {dialogTarget && (
        <PanelLoadBoundary
          reset={MealDialog.reset}
          key={dialogTarget.kind === 'edit' ? `edit-${dialogTarget.plan.id}` : 'add'}
          onError={() => {
            setDialog(null)
            toasts.show({
              message: "Couldn't open the meal form. Check your connection and try again.",
              tone: 'error',
            })
          }}
        >
          <Suspense fallback={null}>
            <MealDialog
              target={dialogTarget}
              recipes={recipes}
              onClose={() => setDialog(null)}
              onAdd={add}
              onChange={(id, patch) => void actions.change(id, patch)}
              onFavourite={(plan, value) => void actions.setFavourite(plan, value)}
              onDelete={(plan) => {
                // The meal she pressed goes away: focus moves to the button that adds one.
                if (actions.remove(plan))
                  requestAnimationFrame(() => document.getElementById('add-meal')?.focus())
              }}
            />
          </Suspense>
        </PanelLoadBoundary>
      )}
      {conflict && (
        <ReplacePrompt
          canReplace={canReplace}
          slot={`${MEAL_TYPE_LABEL[conflict.draft.mealType]} on ${dayLabel(conflict.draft.planDate)}`}
          existingName={existing?.mealName ?? null}
          newName={conflict.draft.mealName}
          onReplace={replace}
          onCancel={() => setConflict(null)}
        />
      )}
    </>,
    <>
      <Segmented
        label="View"
        options={TAB_OPTIONS}
        value={tab}
        onChange={(next) => go(next, date)}
      />
      <Button
        id="add-meal"
        variant="primary"
        onPress={() => setDialog({ target: { kind: 'add', date, type: DEFAULT_TYPE } })}
      >
        Add meal
      </Button>
    </>,
  )
}
