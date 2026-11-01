# Салон (кілька майстрів)
- `admin_settings/accountType` (solo|salon), `staff/{uid}` (role owner|master), публічне `masters`, `masterId` у записах.
- Слоти: власник `timeslots`, майстри `timeslots_m/{mid}`; черга — ключі `{mid}~date_time`.
- Графік/ціни майстра: `master_settings/{mid}`; злиття — `src/masterSettings.js` (`applyMasterSettings`, копія в клієнті).
- Огляд «Усі»: `src/views/AllMastersView.jsx`.
