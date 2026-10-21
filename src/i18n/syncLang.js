// Мова майстра → БД, щоб сервер (Cloud Functions) надсилав йому сповіщення цією мовою:
// власник / «Один майстер» — instructors/{iid}/admin_settings/lang, майстер салону — instructors/{iid}/staff/{uid}/lang.
// Пишемо лише коли значення відрізняється від збереженого. iid з'являється після входу (setCurrentIid) — стежимо за ним.
import { onAuthStateChanged } from 'firebase/auth'
import { get, set, ref } from 'firebase/database'
import { auth, db, getCurrentIid } from '../firebase.js'
import { DEMO } from '../demo/demoMode.js'
import { getLang } from './index.js'

export function startLangSync() {
  if (DEMO) return
  let uid = null
  const done = new Map() // "iid/uid/lang" → до якого моменту не повторювати (Infinity — записано або збігається)
  onAuthStateChanged(auth, (u) => { uid = u?.uid || null })
  setInterval(async () => {
    const iid = getCurrentIid()
    if (!uid || !iid) return // вендор не має власного простору; майстер ще не визначений
    const lang = getLang()
    const key = `${iid}/${uid}/${lang}`
    if ((done.get(key) || 0) > Date.now()) return
    done.set(key, Infinity)
    try {
      const r = ref(db, uid === iid ? `instructors/${iid}/admin_settings/lang` : `instructors/${iid}/staff/${uid}/lang`)
      if ((await get(r)).val() !== lang) await set(r, lang)
    } catch { done.set(key, Date.now() + 60000) /* немає мережі/прав (напр. режим читання) — повторимо за хвилину */ }
  }, 2000)
}
