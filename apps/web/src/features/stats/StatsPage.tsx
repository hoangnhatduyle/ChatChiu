// Waste & Stats (SPEC-ST-001, route /stats): the overview of the kitchen, then the waste figures, charts
// and log under a time range and category filter held in the URL. Reads and deletes only through the data
// hooks (AR-NO-DIRECT-API); the figures themselves are the API's, so every definition (stock value, low
// stock, run-out) lives in one place (AR-ONE-DEFINITION).
import { todayInTimeZone, filterWasteEntries } from '@chatchiu/domain'
import { useSearchParams } from 'react-router'
import { useBootstrapQuery } from '../../data/inventory'
import { usePreferencesQuery } from '../../data/preferences'
import { useStatsOverviewQuery } from '../../data/stats'
import { useWasteQuery } from '../../data/waste'
import { PageTitle } from '../../shell/PageTitle'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Skeleton'
import { money } from './format'
import { Overview } from './Overview'
import { parseStatsParams, statsSearch } from './stats-params'
import { WasteLog } from './WasteLog'
import { WasteFigures, WasteFilters } from './WasteSection'

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export default function StatsPage() {
  const [params, setParams] = useSearchParams()
  const categories = useBootstrapQuery().data?.categories
  const { range, categoryId } = parseStatsParams(
    params,
    categories?.map((c) => c.id),
  )
  const preferences = usePreferencesQuery()
  // The server dates waste in her saved timezone: the log waits for it (or for its failure) so both agree.
  const timezone =
    preferences.data?.timezone ?? (preferences.isError ? browserTimeZone() : undefined)
  const overview = useStatsOverviewQuery('all')
  const waste = useStatsOverviewQuery(range, categoryId ?? undefined)
  const log = useWasteQuery()

  const frame = (children: React.ReactNode) => (
    <div className="px-4 pt-5 pb-6 md:px-6 md:pt-6">
      <PageTitle>Waste & Stats</PageTitle>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  )
  const retry = () => {
    void overview.refetch()
    void waste.refetch()
    void log.refetch()
  }
  if (!overview.data) {
    return frame(
      overview.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-base font-semibold">
            Couldn&apos;t load the figures. Check your connection and try again.
          </p>
          <Button variant="primary" onPress={retry}>
            Retry
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading the figures" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ),
    )
  }

  const entries =
    log.data && timezone
      ? filterWasteEntries(log.data, {
          range,
          categoryId,
          today: todayInTimeZone(timezone),
          timezone,
        })
      : undefined
  const change = (nextRange: typeof range, nextCategory: number | null) =>
    setParams(new URLSearchParams(statsSearch(nextRange, nextCategory)), { replace: true })

  return frame(
    <>
      {((overview.isError && overview.data) || (waste.isError && waste.data)) && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-card border border-line bg-status-soon-bg px-4 py-2 text-md font-semibold text-status-soon-fg"
        >
          <p className="flex-1">
            Couldn&apos;t refresh. You are seeing what was saved on this device.
          </p>
          <Button variant="secondary" onPress={retry}>
            Retry
          </Button>
        </div>
      )}
      <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
        <h2 id="overview-heading" className="text-lg font-extrabold">
          Overview
        </h2>
        <Overview overview={overview.data} />
      </section>
      <section aria-labelledby="waste-heading" className="flex flex-col gap-3">
        <h2 id="waste-heading" className="text-lg font-extrabold">
          Waste
        </h2>
        <WasteFilters
          range={range}
          categoryId={categoryId}
          categories={categories ?? []}
          onChange={change}
        />
        {waste.data ? (
          <>
            <p role="status" className="sr-only">
              {`${waste.data.waste.totalItems} items wasted, ${money(waste.data.waste.totalValue)} lost`}
            </p>
            <WasteFigures waste={waste.data.waste} />
          </>
        ) : waste.isError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-base font-semibold">
              Couldn&apos;t load the waste figures.
            </p>
            <Button onPress={() => void waste.refetch()}>Retry</Button>
          </div>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
        {entries && timezone ? (
          <WasteLog
            entries={entries}
            categories={categories ?? []}
            timezone={timezone}
            isFiltered={range !== 'all' || categoryId !== null}
          />
        ) : log.isError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-base font-semibold">
              Couldn&apos;t load the waste log.
            </p>
            <Button onPress={() => void log.refetch()}>Retry</Button>
          </div>
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </section>
    </>,
  )
}
