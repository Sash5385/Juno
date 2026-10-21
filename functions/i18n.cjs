// Локалізація серверних текстів (push, сповіщення, автоповідомлення чату) мовою отримувача.
// Мова зберігається в БД: клієнт — users/{uid}/lang, власник — admin_settings/lang, майстер салону — staff/{uid}/lang.
// Ключ словника — український текст-шаблон з {змінними}; uk (або немає мови/рядка в словнику) → текст як є,
// тож поведінка для української не змінюється. Тексти, які змінив майстер (шаблони, повідомлення в чаті), у словнику
// не збігаються за ключем і лишаються без перекладу — перекладаються лише вбудовані (типові) тексти.
// УВАГА: заміна слів за напрямком (terms.cjs: запис→сеанс…) діє лише для uk — викликач застосовує її окремо.

const LANGS = ["uk", "en", "pl", "de", "es", "fr"];
const LOCALE = { uk: "uk-UA", en: "en-GB", pl: "pl-PL", de: "de-DE", es: "es-ES", fr: "fr-FR" };
const normLang = (l) => (LANGS.includes(l) ? l : "uk");

// [uk, en, pl, de, es, fr]
const E = (uk, en, pl, de, es, fr) => [uk, { en, pl, de, es, fr }];
const DICT = Object.fromEntries([
  // ── Загальне ──
  E("{date} о {time}", "{date} at {time}", "{date} o {time}", "{date} um {time}", "{date} a las {time}", "{date} à {time}"),
  E("Клієнт", "Client", "Klient", "Kunde", "Cliente", "Client"),
  E("Майстер", "Specialist", "Specjalista", "Fachkraft", "Especialista", "Spécialiste"),
  E("Повідомлення", "Message", "Wiadomość", "Nachricht", "Mensaje", "Message"),
  E("{h} год", "{h} h", "{h} godz.", "{h} Std.", "{h} h", "{h} h"),
  E("{m} хв", "{m} min", "{m} min", "{m} Min.", "{m} min", "{m} min"),
  E("{h} год {m} хв", "{h} h {m} min", "{h} godz. {m} min", "{h} Std. {m} Min.", "{h} h {m} min", "{h} h {m} min"),
  E("о {time}", "at {time}", "o {time}", "um {time}", "a las {time}", "à {time}"),
  E(" та ", " and ", " i ", " und ", " y ", " et "),
  E("група заповнена", "the group is full", "grupa jest pełna", "die Gruppe ist voll", "el grupo está lleno", "le groupe est complet"),
  // ── Клієнту ──
  E("⚠️ Запис недоступний", "⚠️ Booking unavailable", "⚠️ Rezerwacja niedostępna", "⚠️ Termin nicht verfügbar", "⚠️ Reserva no disponible", "⚠️ Réservation indisponible"),
  E("Не вдалося записати в групу: {reason}.", "Could not book into the group: {reason}.", "Nie udało się zapisać do grupy: {reason}.", "Buchung in der Gruppe nicht möglich: {reason}.", "No se pudo reservar en el grupo: {reason}.", "Impossible de réserver dans le groupe : {reason}."),
  E("Майстер тимчасово не приймає нові записи.", "The specialist is temporarily not accepting new bookings.", "Specjalista chwilowo nie przyjmuje nowych rezerwacji.", "Die Fachkraft nimmt vorübergehend keine neuen Buchungen an.", "El especialista no acepta nuevas reservas por el momento.", "Le spécialiste n'accepte temporairement pas de nouvelles réservations."),
  E("📋 Запис заплановано", "📋 Appointment scheduled", "📋 Wizyta zaplanowana", "📋 Termin eingeplant", "📋 Cita programada", "📋 Rendez-vous planifié"),
  E("✅ Запис підтверджено", "✅ Appointment confirmed", "✅ Wizyta potwierdzona", "✅ Termin bestätigt", "✅ Cita confirmada", "✅ Rendez-vous confirmé"),
  E("❌ Запис скасовано", "❌ Appointment cancelled", "❌ Wizyta odwołana", "❌ Termin abgesagt", "❌ Cita cancelada", "❌ Rendez-vous annulé"),
  E("🔄 Запис перенесено", "🔄 Appointment rescheduled", "🔄 Wizyta przeniesiona", "🔄 Termin verschoben", "🔄 Cita reprogramada", "🔄 Rendez-vous déplacé"),
  E("Новий час: {date} о {time} (було {oldDate} о {oldTime})", "New time: {date} at {time} (was {oldDate} at {oldTime})", "Nowy termin: {date} o {time} (było {oldDate} o {oldTime})", "Neue Zeit: {date} um {time} (vorher {oldDate} um {oldTime})", "Nueva hora: {date} a las {time} (antes {oldDate} a las {oldTime})", "Nouvelle heure : {date} à {time} (avant : {oldDate} à {oldTime})"),
  E("🎉 Слот зарезервовано для вас!", "🎉 A slot is reserved for you!", "🎉 Termin zarezerwowany dla Ciebie!", "🎉 Ein Termin ist für Sie reserviert!", "🎉 ¡Hay un hueco reservado para ti!", "🎉 Un créneau est réservé pour vous !"),
  E("{date} о {time} — у вас 30 хвилин щоб записатись", "{date} at {time} — you have 30 minutes to book it", "{date} o {time} — masz 30 minut na rezerwację", "{date} um {time} — Sie haben 30 Minuten zum Buchen", "{date} a las {time} — tienes 30 minutos para reservar", "{date} à {time} — vous avez 30 minutes pour réserver"),
  E("📅 Звільнився слот!", "📅 A slot has opened up!", "📅 Zwolnił się termin!", "📅 Ein Termin ist frei geworden!", "📅 ¡Se ha liberado un hueco!", "📅 Un créneau s'est libéré !"),
  E("{date} о {time} — є вільне місце", "{date} at {time} — a spot is available", "{date} o {time} — jest wolne miejsce", "{date} um {time} — ein Platz ist frei", "{date} a las {time} — hay un hueco libre", "{date} à {time} — une place est disponible"),
  E("📅 Є вільний слот!", "📅 A free slot is available!", "📅 Jest wolny termin!", "📅 Ein freier Termin ist verfügbar!", "📅 ¡Hay un hueco libre!", "📅 Un créneau est disponible !"),
  E("⏰ Нагадування про запис", "⏰ Appointment reminder", "⏰ Przypomnienie o wizycie", "⏰ Terminerinnerung", "⏰ Recordatorio de cita", "⏰ Rappel de rendez-vous"),
  E("Завтра о {time} — {date}", "Tomorrow at {time} — {date}", "Jutro o {time} — {date}", "Morgen um {time} — {date}", "Mañana a las {time} — {date}", "Demain à {time} — {date}"),
  E("⏰ Запис через 2 години", "⏰ Appointment in 2 hours", "⏰ Wizyta za 2 godziny", "⏰ Termin in 2 Stunden", "⏰ Cita en 2 horas", "⏰ Rendez-vous dans 2 heures"),
  E("о {time} — {date}", "at {time} — {date}", "o {time} — {date}", "um {time} — {date}", "a las {time} — {date}", "à {time} — {date}"),
  E("📅 Час записатись знову", "📅 Time to book again", "📅 Czas umówić się ponownie", "📅 Zeit für den nächsten Termin", "📅 Es hora de volver a reservar", "📅 C'est le moment de reprendre rendez-vous"),
  E("Минуло {days} дн. після «{service}». Оберіть зручний час.", "{days} days have passed since “{service}”. Pick a convenient time.", "Minęło {days} dni od „{service}”. Wybierz dogodny termin.", "Seit „{service}“ sind {days} Tage vergangen. Wählen Sie einen passenden Termin.", "Han pasado {days} días desde «{service}». Elige un horario que te convenga.", "{days} jours se sont écoulés depuis « {service} ». Choisissez un horaire qui vous convient."),
  // ── Типові шаблони майстра (admin_data/templates; змінений майстром текст не перекладається) ──
  E("Нагадування за 24 год", "24-hour reminder", "Przypomnienie 24 godz. wcześniej", "Erinnerung 24 Std. vorher", "Recordatorio 24 h antes", "Rappel 24 h avant"),
  E("Нагадування за 2 год", "2-hour reminder", "Przypomnienie 2 godz. wcześniej", "Erinnerung 2 Std. vorher", "Recordatorio 2 h antes", "Rappel 2 h avant"),
  E("Підтвердження запису", "Booking confirmation", "Potwierdzenie rezerwacji", "Buchungsbestätigung", "Confirmación de reserva", "Confirmation de réservation"),
  E("Скасування запису", "Booking cancellation", "Odwołanie rezerwacji", "Buchungsstornierung", "Cancelación de reserva", "Annulation de réservation"),
  E("Вітання нового клієнта", "Welcome message", "Powitanie nowego klienta", "Willkommensnachricht", "Bienvenida al nuevo cliente", "Message de bienvenue"),
  E("Пропозиція вільного слоту", "Free slot offer", "Propozycja wolnego terminu", "Angebot eines freien Termins", "Oferta de hueco libre", "Proposition de créneau libre"),
  E("Прохання про відгук", "Review request", "Prośba o opinię", "Bitte um Bewertung", "Solicitud de reseña", "Demande d'avis"),
  E("Особливі умови", "Special offer", "Oferta specjalna", "Sonderangebot", "Oferta especial", "Offre spéciale"),
  E("Привіт, {ім'я}! 🔔 Нагадуємо про запис завтра {дата} о {час}. Чекаємо на тебе! Якщо потрібно перенести — напиши нам.",
    "Hi, {ім'я}! 🔔 A reminder about your appointment tomorrow, {дата} at {час}. We look forward to seeing you! If you need to reschedule, just message us.",
    "Cześć, {ім'я}! 🔔 Przypominamy o wizycie jutro, {дата} o {час}. Czekamy na Ciebie! Jeśli chcesz przełożyć termin, napisz do nas.",
    "Hallo, {ім'я}! 🔔 Wir erinnern dich an deinen Termin morgen, {дата} um {час}. Wir freuen uns auf dich! Wenn du verschieben möchtest, schreib uns einfach.",
    "¡Hola, {ім'я}! 🔔 Te recordamos tu cita de mañana, {дата} a las {час}. ¡Te esperamos! Si necesitas cambiarla, escríbenos.",
    "Bonjour {ім'я} ! 🔔 Nous vous rappelons votre rendez-vous demain, {дата} à {час}. Nous vous attendons ! Si vous devez le déplacer, écrivez-nous."),
  E("🔔 Нагадуємо: запис сьогодні о {час}. Майстер: {майстер}",
    "🔔 Reminder: your appointment is today at {час}. Specialist: {майстер}",
    "🔔 Przypominamy: wizyta dziś o {час}. Specjalista: {майстер}",
    "🔔 Zur Erinnerung: Dein Termin ist heute um {час}. Fachkraft: {майстер}",
    "🔔 Recordatorio: tu cita es hoy a las {час}. Especialista: {майстер}",
    "🔔 Rappel : votre rendez-vous est aujourd'hui à {час}. Spécialiste : {майстер}"),
  E("✅ {ім'я}, твій запис підтверджено!\n📅 {дата} о {час}\n💼 {послуга} — {ціна} ₴\nЧекаємо!",
    "✅ {ім'я}, your appointment is confirmed!\n📅 {дата} at {час}\n💼 {послуга} — {ціна} ₴\nSee you soon!",
    "✅ {ім'я}, Twoja wizyta została potwierdzona!\n📅 {дата} o {час}\n💼 {послуга} — {ціна} ₴\nDo zobaczenia!",
    "✅ {ім'я}, dein Termin ist bestätigt!\n📅 {дата} um {час}\n💼 {послуга} — {ціна} ₴\nBis bald!",
    "✅ {ім'я}, ¡tu cita está confirmada!\n📅 {дата} a las {час}\n💼 {послуга} — {ціна} ₴\n¡Te esperamos!",
    "✅ {ім'я}, votre rendez-vous est confirmé !\n📅 {дата} à {час}\n💼 {послуга} — {ціна} ₴\nÀ bientôt !"),
  E("❌ {ім'я}, на жаль запис {дата} о {час} скасовано. Якщо хочеш записатись на інший час — напиши нам або відкрий додаток.",
    "❌ {ім'я}, unfortunately your appointment on {дата} at {час} has been cancelled. If you want to book another time, message us or open the app.",
    "❌ {ім'я}, niestety wizyta {дата} o {час} została odwołana. Jeśli chcesz umówić się na inny termin, napisz do nas lub otwórz aplikację.",
    "❌ {ім'я}, dein Termin am {дата} um {час} wurde leider abgesagt. Wenn du einen anderen Termin buchen möchtest, schreib uns oder öffne die App.",
    "❌ {ім'я}, lamentablemente tu cita del {дата} a las {час} ha sido cancelada. Si quieres reservar otro horario, escríbenos o abre la app.",
    "❌ {ім'я}, votre rendez-vous du {дата} à {час} a malheureusement été annulé. Pour en réserver un autre, écrivez-nous ou ouvrez l'application."),
  E("👋 Привіт, {ім'я}! Раді бачити тебе в Juno!\nЯ — {майстер}, твій майстер.\nЗаписуйся на перший запис — будемо раді тебе бачити! 🙂",
    "👋 Hi, {ім'я}! Welcome to Juno!\nI'm {майстер}, your specialist.\nBook your first appointment — we'd love to see you! 🙂",
    "👋 Cześć, {ім'я}! Witamy w Juno!\nJestem {майстер}, Twój specjalista.\nUmów pierwszą wizytę — chętnie Cię zobaczymy! 🙂",
    "👋 Hallo, {ім'я}! Willkommen bei Juno!\nIch bin {майстер}, deine Fachkraft.\nBuche deinen ersten Termin — wir freuen uns auf dich! 🙂",
    "👋 ¡Hola, {ім'я}! ¡Bienvenido/a a Juno!\nSoy {майстер}, tu especialista.\nReserva tu primera cita: ¡nos encantará verte! 🙂",
    "👋 Bonjour {ім'я} ! Bienvenue sur Juno !\nJe suis {майстер}, votre spécialiste.\nPrenez votre premier rendez-vous — nous serons ravis de vous voir ! 🙂"),
  E("⏳ {ім'я}, з'явився вільний запис {дата} о {час}! Підтвердити запис → відкрий додаток.",
    "⏳ {ім'я}, a slot has opened up on {дата} at {час}! To book it, open the app.",
    "⏳ {ім'я}, zwolnił się termin {дата} o {час}! Aby go zarezerwować, otwórz aplikację.",
    "⏳ {ім'я}, am {дата} um {час} ist ein Termin frei geworden! Zum Buchen öffne die App.",
    "⏳ {ім'я}, ¡se ha liberado un hueco el {дата} a las {час}! Para reservarlo, abre la app.",
    "⏳ {ім'я}, un créneau s'est libéré le {дата} à {час} ! Pour le réserver, ouvrez l'application."),
  E("Привіт, {ім'я}! Як пройшов запис {дата}? Буду вдячний за відгук 🙏",
    "Hi, {ім'я}! How was your appointment on {дата}? I'd appreciate your feedback 🙏",
    "Cześć, {ім'я}! Jak minęła wizyta {дата}? Będę wdzięczny za opinię 🙏",
    "Hallo, {ім'я}! Wie war dein Termin am {дата}? Ich freue mich über dein Feedback 🙏",
    "¡Hola, {ім'я}! ¿Qué tal fue tu cita del {дата}? Agradecería tu opinión 🙏",
    "Bonjour {ім'я} ! Comment s'est passé votre rendez-vous du {дата} ? Je serais ravi d'avoir votre avis 🙏"),
  E("Привіт! Для тебе діє спеціальна пропозиція: {послуга} за {ціна} ₴. Діє тільки цього тижня!",
    "Hi! A special offer for you: {послуга} for {ціна} ₴. Valid this week only!",
    "Cześć! Mamy dla Ciebie ofertę specjalną: {послуга} za {ціна} ₴. Tylko w tym tygodniu!",
    "Hallo! Ein Sonderangebot für dich: {послуга} für {ціна} ₴. Nur diese Woche gültig!",
    "¡Hola! Tenemos una oferta especial para ti: {послуга} por {ціна} ₴. ¡Solo esta semana!",
    "Bonjour ! Une offre spéciale pour vous : {послуга} pour {ціна} ₴. Valable uniquement cette semaine !"),
  // ── Майстру / власнику ──
  E("⚠️ Запис у групу відхилено", "⚠️ Group booking rejected", "⚠️ Odrzucono rezerwację w grupie", "⚠️ Gruppenbuchung abgelehnt", "⚠️ Reserva en grupo rechazada", "⚠️ Réservation de groupe refusée"),
  E("{name} · {date} о {time}: {reason}", "{name} · {date} at {time}: {reason}", "{name} · {date} o {time}: {reason}", "{name} · {date} um {time}: {reason}", "{name} · {date} a las {time}: {reason}", "{name} · {date} à {time} : {reason}"),
  E("🔁 Запис перенесено", "🔁 Appointment rescheduled", "🔁 Wizyta przeniesiona", "🔁 Termin verschoben", "🔁 Cita reprogramada", "🔁 Rendez-vous déplacé"),
  E("📋 Новий запис", "📋 New booking", "📋 Nowa rezerwacja", "📋 Neue Buchung", "📋 Nueva reserva", "📋 Nouvelle réservation"),
  E("з {od} о {ot} на {nd} о {nt}", "from {od} at {ot} to {nd} at {nt}", "z {od} o {ot} na {nd} o {nt}", "von {od} um {ot} auf {nd} um {nt}", "del {od} a las {ot} al {nd} a las {nt}", "du {od} à {ot} au {nd} à {nt}"),
  E("{name} · {date} о {time}", "{name} · {date} at {time}", "{name} · {date} o {time}", "{name} · {date} um {time}", "{name} · {date} a las {time}", "{name} · {date} à {time}"),
  E("{date} о {time} · {phone}", "{date} at {time} · {phone}", "{date} o {time} · {phone}", "{date} um {time} · {phone}", "{date} a las {time} · {phone}", "{date} à {time} · {phone}"),
  E("✅ Підтвердив присутність", "✅ Attendance confirmed", "✅ Potwierdzono obecność", "✅ Teilnahme bestätigt", "✅ Asistencia confirmada", "✅ Présence confirmée"),
  E("💬 Коментар до запису", "💬 Booking comment", "💬 Komentarz do rezerwacji", "💬 Kommentar zur Buchung", "💬 Comentario de la reserva", "💬 Commentaire sur la réservation"),
  E("🎉 Новий клієнт", "🎉 New client", "🎉 Nowy klient", "🎉 Neuer Kunde", "🎉 Nuevo cliente", "🎉 Nouveau client"),
  E("Новий клієнт", "New client", "Nowy klient", "Neuer Kunde", "Nuevo cliente", "Nouveau client"),
  E("Студент", "Client", "Klient", "Kunde", "Cliente", "Client"),
  E("⏰ Нагадування", "⏰ Reminder", "⏰ Przypomnienie", "⏰ Erinnerung", "⏰ Recordatorio", "⏰ Rappel"),
  E("🔔 Нагадування", "🔔 Reminder", "🔔 Przypomnienie", "🔔 Erinnerung", "🔔 Recordatorio", "🔔 Rappel"),
  E("Нотатка на {date}", "Note for {date}", "Notatka na {date}", "Notiz für {date}", "Nota para el {date}", "Note pour le {date}"),
  E("🔒 Режим читання", "🔒 Read-only mode", "🔒 Tryb tylko do odczytu", "🔒 Lesemodus", "🔒 Modo de solo lectura", "🔒 Mode lecture seule"),
  E("Підписку не оплачено — акаунт переведено в режим читання. Оплатіть у Налаштуваннях, щоб відновити роботу.",
    "The subscription is unpaid — the account is now read-only. Pay in Settings to restore access.",
    "Subskrypcja nie została opłacona — konto przełączono w tryb tylko do odczytu. Opłać ją w Ustawieniach, aby przywrócić działanie.",
    "Das Abonnement wurde nicht bezahlt — das Konto ist jetzt im Lesemodus. Zahlen Sie in den Einstellungen, um die Nutzung fortzusetzen.",
    "La suscripción no se ha pagado: la cuenta está en modo de solo lectura. Paga en Ajustes para recuperar el acceso.",
    "L'abonnement n'est pas payé — le compte est passé en lecture seule. Payez dans les Réglages pour rétablir l'accès."),
  E("⚠️ Підписку не оплачено", "⚠️ Subscription unpaid", "⚠️ Subskrypcja nieopłacona", "⚠️ Abonnement nicht bezahlt", "⚠️ Suscripción sin pagar", "⚠️ Abonnement impayé"),
  E("Сьогодні остання доба — далі акаунт перейде в режим читання. Оплатіть у Налаштуваннях.",
    "Today is the last day — after that the account becomes read-only. Pay in Settings.",
    "Dziś ostatni dzień — potem konto przejdzie w tryb tylko do odczytu. Opłać w Ustawieniach.",
    "Heute ist der letzte Tag — danach wechselt das Konto in den Lesemodus. Zahlen Sie in den Einstellungen.",
    "Hoy es el último día: después la cuenta pasará a solo lectura. Paga en Ajustes.",
    "Aujourd'hui est le dernier jour — ensuite le compte passera en lecture seule. Payez dans les Réglages."),
  E("⏳ Скоро завершення", "⏳ Ending soon", "⏳ Wkrótce koniec", "⏳ Läuft bald ab", "⏳ Finaliza pronto", "⏳ Bientôt terminé"),
  E("Пробний період", "The trial period", "Okres próbny", "Der Testzeitraum", "El periodo de prueba", "La période d'essai"),
  E("Підписка", "The subscription", "Subskrypcja", "Das Abonnement", "La suscripción", "L'abonnement"),
  E("{what} закінчується {date} (через {days} дн.). Продовжіть у Налаштуваннях.",
    "{what} ends on {date} (in {days} days). Renew in Settings.",
    "{what} kończy się {date} (za {days} dni). Przedłuż w Ustawieniach.",
    "{what} endet am {date} (in {days} Tagen). Verlängern Sie in den Einstellungen.",
    "{what} termina el {date} (en {days} días). Renueva en Ajustes.",
    "{what} se termine le {date} (dans {days} jours). Prolongez dans les Réglages."),
  E("↩️ Платіж повернено ({provider})", "↩️ Payment refunded ({provider})", "↩️ Płatność zwrócona ({provider})", "↩️ Zahlung erstattet ({provider})", "↩️ Pago reembolsado ({provider})", "↩️ Paiement remboursé ({provider})"),
  E("Кошти повернено — підписку Juno знято.", "The payment was refunded — the Juno subscription has been removed.", "Środki zwrócono — subskrypcję Juno zdjęto.", "Der Betrag wurde erstattet — das Juno-Abonnement wurde aufgehoben.", "Se reembolsó el pago: la suscripción de Juno se ha retirado.", "Le paiement a été remboursé — l'abonnement Juno est supprimé."),
  E("✅ Оплата отримана ({provider})", "✅ Payment received ({provider})", "✅ Płatność otrzymana ({provider})", "✅ Zahlung eingegangen ({provider})", "✅ Pago recibido ({provider})", "✅ Paiement reçu ({provider})"),
  E("Підписку Juno продовжено на {period}.", "Your Juno subscription has been extended by {period}.", "Subskrypcję Juno przedłużono o {period}.", "Ihr Juno-Abonnement wurde um {period} verlängert.", "La suscripción de Juno se ha ampliado {period}.", "Votre abonnement Juno a été prolongé de {period}."),
  E("рік", "a year", "rok", "ein Jahr", "un año", "1 an"),
  E("місяць", "a month", "miesiąc", "einen Monat", "un mes", "1 mois"),
]);

// Підстановка {змінних}: невідомі змінні (наприклад {ім'я} типового шаблону, що рендериться пізніше) лишаються як є
function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{([^{}]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m));
}

// t(lang, ukText, vars) — текст мовою отримувача. uk / невідомий рядок → український текст (з підстановкою змінних)
function t(lang, ukText, vars) {
  if (typeof ukText !== "string") return ukText;
  const l = normLang(lang);
  const row = l === "uk" ? null : DICT[ukText];
  return fill((row && row[l]) || ukText, vars);
}

// Є вбудований переклад для цього тексту? (щоб відрізнити типовий шаблон від зміненого майстром)
const hasBuiltin = (ukText) => typeof ukText === "string" && Object.prototype.hasOwnProperty.call(DICT, ukText);

// "YYYY-MM-DD" → коротка дата мовою отримувача. uk — без змін (ISO, як і раніше); не-дата ("—") — як є
function fmtDate(lang, iso) {
  const l = normLang(lang);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (l === "uk" || !m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString(LOCALE[l], { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

// "YYYY-MM-DD" → «ср, 10 червня» мовою отримувача (для uk — як раніше: toLocaleDateString("uk", …))
function fmtDateLong(lang, iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(LOCALE[normLang(lang)], { day: "numeric", month: "long", weekday: "short" });
}

// Timestamp → дата dd.mm.yyyy за Києвом мовою отримувача
function fmtTsDate(lang, ts) {
  return new Date(ts).toLocaleDateString(LOCALE[normLang(lang)], { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric" });
}

module.exports = { LANGS, LOCALE, normLang, t, hasBuiltin, fmtDate, fmtDateLong, fmtTsDate, DICT };
