const DEVICE_LABELS: Record<string, string> = {
  desktop: "Компьютер",
  mobile: "Мобильные",
  tablet: "Планшеты",
  "smart tv": "Smart TV",
  smarttv: "Smart TV",
};

const SOURCE_PARTS: Record<string, string> = {
  "(direct)": "прямой",
  "(none)": "нет",
  "(not set)": "не задано",
  "(organic)": "органический",
  "(referral)": "реферальный",
  direct: "прямой",
  none: "нет",
  organic: "органический",
  referral: "реферальный",
};

const EN_TO_RU_COUNTRY = buildCountryMap();

export function translateDeviceLabel(value: string): string {
  return DEVICE_LABELS[value.trim().toLowerCase()] || capitalize(value);
}

export function translateCountryLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(not set)") return "Не задано";
  return EN_TO_RU_COUNTRY.get(trimmed) || trimmed;
}

export function translateSourceLabel(value: string): string {
  return value
    .split("/")
    .map((part) => {
      const trimmed = part.trim();
      return SOURCE_PARTS[trimmed.toLowerCase()] || SOURCE_PARTS[trimmed] || trimmed;
    })
    .join(" / ");
}

function buildCountryMap(): Map<string, string> {
  const map = new Map<string, string>();
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const ru = new Intl.DisplayNames(["ru"], { type: "region" });
  for (let i = 65; i <= 90; i += 1) {
    for (let j = 65; j <= 90; j += 1) {
      const code = String.fromCharCode(i) + String.fromCharCode(j);
      const enName = en.of(code);
      const ruName = ru.of(code);
      if (enName && ruName && enName !== code) map.set(enName, ruName);
    }
  }
  return map;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
