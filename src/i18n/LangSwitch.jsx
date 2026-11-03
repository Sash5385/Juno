import { useContext, useEffect, useRef, useState } from 'react'
import { LANGS, LANG_NAMES, getLang, setLang } from './index.js'
import { ThemeContext } from '../theme.js'

// Перемикач мови інтерфейсу у стилі «Туман»: компактна кнопка + випадаючий список.
// Мова зберігається в localStorage, сторінка перезавантажується (див. setLang).
export default function LangSwitch({ style }) {
  const th = useContext(ThemeContext)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 8 })
  const btnRef = useRef(null)
  const cur = getLang()

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const close = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const accent = th.ACCENT || '#60a5fa'
  const text = th.TEXT || '#e8edf6'
  const sheet = th.SHEET || `linear-gradient(180deg,${th.SURF_HI || '#1a2132'},${th.BG || '#10141c'})`
  const line = `rgba(${th.GLOW || '255,255,255'},.16)`

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-no-i18n
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          font: 'inherit', fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: text,
          background: `rgba(${th.GLOW || '255,255,255'},.08)`, border: `1px solid ${line}`,
          borderRadius: 10, padding: '0 8px', minHeight: 28, cursor: 'pointer', ...style,
        }}
      >
        <span aria-hidden="true">🌐</span>
        <span>{cur.toUpperCase()}</span>
        <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            role="listbox"
            data-no-i18n
            style={{
              position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, minWidth: 168,
              maxWidth: 'calc(100vw - 16px)', padding: 6, borderRadius: 16,
              background: sheet, border: `1px solid ${line}`,
              boxShadow: `0 14px 36px rgba(${th.SHADE || '0,0,0'},.5), inset 0 1px 0 rgba(${th.GLOW || '255,255,255'},.08)`,
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            {LANGS.map((l) => {
              const on = l === cur
              return (
                <button
                  key={l}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => { setOpen(false); if (!on) setLang(l) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
                    padding: '0 12px', border: 'none', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                    font: 'inherit', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? accent : text,
                    background: on ? `${accent}26` : 'transparent',
                  }}
                >
                  <span style={{ width: 22, fontSize: 11, fontWeight: 800, opacity: 0.6 }}>{l.toUpperCase()}</span>
                  <span style={{ flex: 1 }}>{LANG_NAMES[l]}</span>
                  <span aria-hidden="true" style={{ width: 16, textAlign: 'center', fontWeight: 800 }}>{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
