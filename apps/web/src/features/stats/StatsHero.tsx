// The headline of the stats page (F-ST-10): what needs attention now, in a sentence, with the app's own icon.
import type { StatsOverview } from '@chatchiu/contracts'
import { BrandMark } from '../../ui/BrandMark'
import { statsHeadline } from './headline'

export function StatsHero({ overview }: { overview: StatsOverview }) {
  const { title, detail } = statsHeadline(overview)
  return (
    <div className="flex items-center gap-4 rounded-panel bg-tint-amber p-5 text-tint-amber-ink md:gap-5 md:p-6">
      <BrandMark size={72} className="hidden md:block" />
      <div>
        <p className="font-display text-2xl leading-tight font-extrabold md:text-3xl">{title}</p>
        <p className="mt-2 text-base">{detail}</p>
      </div>
    </div>
  )
}
