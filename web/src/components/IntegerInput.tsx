import { sanitizeIntegerInput, sanitizeSignedIntegerInput } from "@/lib/integerInput";

interface IntegerInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  allowNegative?: boolean;
  className?: string;
}

export default function IntegerInput({
  value,
  onChange,
  label,
  placeholder,
  required,
  min,
  allowNegative = false,
  className = "input-field",
}: IntegerInputProps) {
  const sanitize = allowNegative ? sanitizeSignedIntegerInput : sanitizeIntegerInput;

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium">{label}</label>}
      <input
        type="text"
        inputMode={allowNegative ? "text" : "numeric"}
        className={className}
        placeholder={placeholder}
        required={required}
        min={min}
        value={value}
        onChange={(e) => onChange(sanitize(e.target.value))}
      />
    </div>
  );
}
