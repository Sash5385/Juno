import { COUNTRIES, getCountry, splitPhone, joinPhone } from './phoneCountries'
import { useState } from 'react'

// Поле телефону з вибором країни. value — повний рядок "+380...", onChange(повний рядок)
export default function PhoneField({ value, onChange, style, inputStyle, placeholder, inputClassName, ...rest }) {
  const init = splitPhone(value)
  const [iso, setIso] = useState(init.country.iso)
  const cur = splitPhone(value)
  // Якщо значення ззовні змінилось на інший код — підхопити країну; для однакових кодів (US/CA) тримаємо вибір
  const country = (cur.country.code === getCountry(iso).code) ? getCountry(iso) : cur.country
  const digits = cur.national
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, ...style }}>
      <select
        value={country.iso}
        onChange={e => { const c = getCountry(e.target.value); setIso(c.iso); onChange(joinPhone(c, digits.slice(0, c.max))) }}
        aria-label="Країна"
        style={{ flexShrink: 0, width: 'auto', maxWidth: 110, padding: '0 4px', height: 'auto', alignSelf: 'stretch', border: '1px solid rgba(128,128,128,.35)', borderRadius: 8, background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', ...(inputStyle && inputStyle.fontSize ? { fontSize: inputStyle.fontSize } : {}) }}
      >
        {COUNTRIES.map(c => <option key={c.iso} value={c.iso}>{c.flag} {c.code}</option>)}
      </select>
      <input
        type="tel"
        className={inputClassName}
        inputMode="numeric"
        maxLength={country.max}
        placeholder={placeholder}
        value={digits}
        onChange={e => onChange(joinPhone(country, e.target.value.replace(/\D/g, '').slice(0, country.max)))}
        style={{ flex: 1, minWidth: 0, ...inputStyle }}
        {...rest}
      />
    </div>
  )
}
