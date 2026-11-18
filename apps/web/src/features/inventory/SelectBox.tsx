// The checkbox of select mode (F-IN-10): a native checkbox in a 44 px target, named "Select <item>".
export type SelectBoxProps = { name: string; checked: boolean; onChange: () => void }

export function SelectBox({ name, checked, onChange }: SelectBoxProps) {
  return (
    <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={`Select ${name}`}
        checked={checked}
        onChange={onChange}
        className="size-5 cursor-pointer accent-(--accent)"
      />
    </label>
  )
}
