// The icon and colour pickers of a location form, shared by Add and Edit. Each is a radio group with an
// "Automatic" choice (null: the name-based guess in ui/location-style.ts). The chosen one is marked with a
// thicker border AND a tick, so the choice never rests on colour alone. Targets are 44 px.
import { Radio, RadioGroup } from 'react-aria-components'
import { cx } from '../../ui/cx'
import { LABEL } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import {
  LOCATION_COLORS,
  LOCATION_COLOR_LABEL,
  LOCATION_ICONS,
  LOCATION_ICON_LABEL,
  LOCATION_TINT_CLASS,
  type LocationColor,
  type LocationIcon,
} from '../../ui/location-style'

export type LocationStyleDraft = { icon: LocationIcon | null; color: LocationColor | null }

const PICK =
  'relative flex size-touch cursor-pointer items-center justify-center rounded-control border border-field-line ' +
  'data-hovered:bg-hover data-selected:border-2 data-selected:border-accent data-focus-visible:outline-2 data-focus-visible:outline-offset-2'
const AUTO = 'w-auto px-3 text-sm font-bold'
const AUTO_VALUE = ''

const isIcon = (v: string): v is LocationIcon => LOCATION_ICONS.some((i) => i === v)
const isColor = (v: string): v is LocationColor => LOCATION_COLORS.some((c) => c === v)

const Tick = () => (
  <span
    aria-hidden="true"
    className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-pill bg-accent text-accent-ink group-data-selected:flex"
  >
    <Icon name="check" size={12} strokeWidth={3} />
  </span>
)

export function LocationStyleFields({
  value,
  onChange,
  idPrefix,
}: {
  value: LocationStyleDraft
  onChange: (next: LocationStyleDraft) => void
  /** Keeps the group names unique when two forms are on the page ("Icon for Fridge"). */
  idPrefix: string
}) {
  return (
    <>
      <p className={LABEL}>Icon</p>
      <RadioGroup
        aria-label={`Icon for ${idPrefix}`}
        value={value.icon ?? AUTO_VALUE}
        onChange={(v) => onChange({ ...value, icon: isIcon(v) ? v : null })}
        className="flex flex-wrap gap-2"
      >
        <Radio value={AUTO_VALUE} className={cx(PICK, AUTO, 'group')}>
          Automatic
          <Tick />
        </Radio>
        {LOCATION_ICONS.map((icon) => (
          <Radio
            key={icon}
            value={icon}
            aria-label={LOCATION_ICON_LABEL[icon]}
            className={cx(PICK, 'group')}
          >
            <Icon name={icon} size={22} />
            <Tick />
          </Radio>
        ))}
      </RadioGroup>
      <p className={LABEL}>Colour</p>
      <RadioGroup
        aria-label={`Colour for ${idPrefix}`}
        value={value.color ?? AUTO_VALUE}
        onChange={(v) => onChange({ ...value, color: isColor(v) ? v : null })}
        className="flex flex-wrap gap-2"
      >
        <Radio value={AUTO_VALUE} className={cx(PICK, AUTO, 'group')}>
          Automatic
          <Tick />
        </Radio>
        {LOCATION_COLORS.map((color) => (
          <Radio
            key={color}
            value={color}
            aria-label={LOCATION_COLOR_LABEL[color]}
            className={cx(PICK, 'group')}
          >
            <span
              aria-hidden="true"
              className={cx('size-7 rounded-pill border border-line', LOCATION_TINT_CLASS[color])}
            />
            <Tick />
          </Radio>
        ))}
      </RadioGroup>
    </>
  )
}
