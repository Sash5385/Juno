import { getCountry, splitPhone, joinPhone } from './phoneCountries'
import CountrySelect from './CountrySelect'
import { useState } from 'react'

// Поле телефону з вибором країни. value — повний рядок "+380...", onChange(повний рядок)
export default function PhoneField({ value, onChange, style, inputStyle, placeholder, inputClassName, ...rest }) {
  const init = splitPhone(value)
  const [iso, setIso] = useState(init.country.iso)
  const cur = splitPhone(value)
  // Якщо значення ззовні змінилось на інший код — підхопити країну; для однакових кодів (US/CA) тримаємо вибір
  // Порожнє поле — тримаємо обрану країну (splitPhone('') повертав UA і скидав вибір)
  const country = (!cur.national || cur.country.code === getCountry(iso).code) ? getCountry(iso) : cur.country
  const digits = cur.national
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, ...style }}>
      <CountrySelect
        value={country.iso}
        onChange={iso => { const c = getCountry(iso); setIso(c.iso); onChange(joinPhone(c, digits.slice(0, c.max))) }}
        style={{ alignSelf: 'stretch', padding: '0 8px', border: '1px solid rgba(128,128,128,.35)', borderRadius: 8, ...(inputStyle && inputStyle.fontSize ? { fontSize: inputStyle.fontSize } : {}) }}
      />
      <input
        type="tel"
        className={inputClassName}
        inputMode="numeric"
        maxLength={country.max}
        placeholder={placeholder && !String(placeholder).startsWith('+') ? placeholder : 'X'.repeat(country.max)}
        value={digits}
        onChange={e => onChange(joinPhone(country, e.target.value.replace(/\D/g, '').slice(0, country.max)))}
        style={{ flex: 1, minWidth: 0, ...inputStyle }}
        {...rest}
      />
    </div>
  )
}
