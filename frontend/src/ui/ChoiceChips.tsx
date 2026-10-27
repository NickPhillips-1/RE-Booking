type Option = { value: string; label: string };

type ChoiceChipsProps = {
  label: string;
  options: Option[];
  selected: string | null;
  onSelect: (value: string) => void;
};

export function ChoiceChips({ label, options, selected, onSelect }: ChoiceChipsProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="chip"
          aria-pressed={option.value === selected}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
