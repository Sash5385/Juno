import { COUNTRIES, FAVORITE_COUNT, getCountry } from './phoneCountries'
import { getLang, tr } from './i18n'

// Вибір коду країни: у полі видно лише прапор і код, у списку — назви країн мовою інтерфейсу.
// Нативний <select> прозорий поверх підпису — на телефоні відкривається системний список.
let namesCache = null
function countryNames() {
  const lang = getLang() || 'uk'
  if (namesCache && namesCache.lang === lang) return namesCache
  let dn = null
  try { dn = new Intl.DisplayNames([lang], { type: 'region' }) } catch { dn = null }
  const name = (iso) => { try { return (dn && dn.of(iso)) || iso } catch { return iso } }
  const fav = COUNTRIES.slice(0, FAVORITE_COUNT).map(c => ({ ...c, name: name(c.iso) }))
  const all = COUNTRIES.slice(FAVORITE_COUNT).map(c => ({ ...c, name: name(c.iso) })).sort((a, b) => a.name.localeCompare(b.name, lang))
  namesCache = { lang, fav, all }
  return namesCache
}

export default function CountrySelect({ value, onChange, className, style }) {
  const c = getCountry(value)
  const { fav, all } = countryNames()
  const opt = (x) => <option key={x.iso} value={x.iso}>{`${x.flag} ${x.name} ${x.code}`}</option>
  return (
    <span className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}>
      <span aria-hidden="true">{c.flag} {c.code}</span>
      <span aria-hidden="true" style={{ fontSize: '0.6em', opacity: 0.6 }}>▼</span>
      <select data-no-i18n value={c.iso} onChange={e => onChange(e.target.value)} aria-label={tr('Країна')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 }}>
        <optgroup label={tr('Часті')}>{fav.map(opt)}</optgroup>
        <optgroup label={tr('Усі країни')}>{all.map(opt)}</optgroup>
      </select>
    </span>
  )
}
