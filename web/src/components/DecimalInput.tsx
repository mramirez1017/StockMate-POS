import { sanitizeMoneyInput, sanitizeOneDecimalInput } from "@/lib/moneyInput";

interface DecimalInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  decimals?: 1 | 2;
  className?: string;
}

export default function DecimalInput({
  value,
  onChange,
  label,
  placeholder,
  required,
  decimals = 1,
  className = "input-field",
}: DecimalInputProps) {
  const sanitize = decimals === 2 ? sanitizeMoneyInput : sanitizeOneDecimalInput;

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium">{label}</label>}
      <input
        type="text"
        inputMode="decimal"
        className={className}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(sanitize(e.target.value))}
      />
    </div>
  );
}
