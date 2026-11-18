// Name with suggestions from her existing items (F-IF-01): once two letters are typed, matching names
// show as buttons under the field; tapping one fills it. Plain buttons rather than a combo box: they work
// the same with touch, keyboard and screen reader, and cost no extra code in the bundle.
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { suggestNames } from './item-form-model'

export type NameFieldProps = {
  value: string
  onChange: (value: string) => void
  existingNames: readonly string[]
  error?: string
}

export function NameField({ value, onChange, existingNames, error }: NameFieldProps) {
  const suggestions = suggestNames(value, existingNames)
  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Name"
        isRequired
        validationBehavior="aria"
        autoComplete="off"
        value={value}
        onChange={onChange}
        isInvalid={error !== undefined}
        errorMessage={error}
      />
      {suggestions.length > 0 && (
        <div role="group" aria-label="Name suggestions" className="flex flex-wrap gap-2">
          {suggestions.map((name) => (
            <Button key={name} onPress={() => onChange(name)}>
              {name}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
