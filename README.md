# dor-bot

בוט לתורי Eztor שמכוון כברירת מחדל רק ל`דור` ורק ל`תספורת גבר/חייל`.

## מה הבוט עושה

- מתחבר לחשבון שלך עם הטוקן של Eztor.
- קורא את התורים העתידיים שלך.
- מחשיב כ"כיסוי שבועי" רק תורים של דור לאותו טיפול.
- אם כבר יש לך תור של דור השבוע, הוא מחפש קודם כול את השבוע הלא מכוסה שהכי קרוב ל־30 יום קדימה, כדי לתפוס את פתיחת החלון החדש.
- נותן עדיפות ליום שלישי ב־18:00.
- אם אין, מחפש יום שלישי אחר אחרי 16:00.
- אם גם זה לא קיים, מחפש ימים אחרים אחרי 16:00.
- רץ פעם אחת או ברצף, עם סריקה צפופה יותר אחרי חצות.

## ברירת מחדל

אם לא מגדירים אחרת ב־`.env`, הבוט עובד על:

- ספר: `דור`
- טיפול: `תספורת גבר/חייל`

כלומר לא צריך להגדיר `EZTOR_TARGET_EMPLOYEE_NAME` או `EZTOR_TARGET_TREATMENT_NAME` אם רוצים לעבוד רק עם דור.

## קבצים נדרשים

### `.env`

הקובץ כבר קיים אצלך מקומית. מינימום שצריך:

```env
EZTOR_TOKEN=...
EZTOR_UNIQEABC=dorg
EZTOR_USER_ID=66cb095f018cbb30bd5806d3
EZTOR_USER_PROFILE_FILE=./data/user-profile.json
EZTOR_TARGET_LEAD_DAYS=30
EZTOR_DRY_RUN=true
```

### `data/user-profile.json`

קובץ המשתמש המלא שלך. הבוט משתמש בו בזמן הזמנה.

## הרצה מקומית

### התקנה

אין כרגע תלויות npm חיצוניות, אז מספיק:

```powershell
npm run discover
```

### בדיקה חד-פעמית

```powershell
npm run start:once
```

### הרצה רציפה

```powershell
npm run start
```

## Docker

### 1. הכנת קבצים

לפני שמריצים על שרת צריך לוודא שיש:

- `.env`
- `data/user-profile.json`

### 2. בניית image

```powershell
docker build -t dor-bot .
```

### 3. הרצה חד-פעמית עם Docker

```powershell
docker run --rm ^
  --env-file .env ^
  -v ${PWD}\\data:/app/data ^
  dor-bot node src/index.js --once
```

### 4. הרצה רציפה עם Docker

```powershell
docker run -d ^
  --name dor-bot ^
  --restart unless-stopped ^
  --env-file .env ^
  -v ${PWD}\\data:/app/data ^
  dor-bot
```

## Docker Compose

### העלאה

```powershell
docker compose up -d --build
```

### צפייה בלוגים

```powershell
docker compose logs -f
```

### עצירה

```powershell
docker compose down
```

### בדיקת `discover` מתוך הקונטיינר

```powershell
docker compose run --rm dor-bot node src/cli/discover.js
```

## מצב בטיחות

ברירת המחדל היא:

```env
EZTOR_DRY_RUN=true
```

ככה הבוט רק מוצא את התור שהיה בוחר, בלי לבצע הזמנה אמיתית.

כשרוצים לעבור להזמנות אמיתיות:

```env
EZTOR_DRY_RUN=false
```

אחרי השינוי צריך להפעיל מחדש את התהליך או את הקונטיינר.

## התרעה על טוקן שפג תוקף

הבוט יודע לזהות כשלי אימות של הטוקן ולשלוח עליהם התרעה.

ההתנהגות היא:

- אם ה־API מחזיר שגיאת אימות כמו `401`, `403`, `Unauthorized` או `invalid token`, הבוט מסמן שהטוקן צריך חידוש.
- בנוסף, כי Eztor לא תמיד מחזיר שגיאת אימות ברורה במסלולי הקריאה, הבוט עוקב גם אחרי גיל הטוקן ושולח תזכורת פרואקטיבית אחרי מספר ימים קבוע.
- הוא שולח התרעה פעם אחת מיד.
- אם לא חידשת את הטוקן, הוא ישלח שוב רק אחרי מספר השעות שמוגדר ב־`EZTOR_ALERT_REPEAT_HOURS`.
- ברגע שהבוט חוזר לעבוד בהצלחה, מצב ההתראה מתאפס.

הגדרות רלוונטיות:

```env
EZTOR_ALERT_REPEAT_HOURS=12
EZTOR_TOKEN_RENEW_AFTER_DAYS=25
```

### התרעת מייל

הדרך הכי פשוטה היא דרך Resend:

```env
RESEND_API_KEY=re_...
EZTOR_ALERT_EMAIL_FROM=alerts@your-domain.com
EZTOR_ALERT_EMAIL_TO=you@example.com
```

חשוב:

- אם שולחים מכתובת על דומיין שלך, הדומיין חייב להיות verified בתוך Resend.
- בלי זה, Resend יאפשר רק שליחת sandbox מוגבלת לכתובת הבעלים של החשבון.
- אם חשוב לך לא ליפול לספאם, הדרך הנכונה היא לאמת את הדומיין ולהשתמש בכתובת `from` מהדומיין שלך.

### התרעת טלפון

יש כרגע שתי אפשרויות מובנות:

#### Telegram

```env
EZTOR_TELEGRAM_BOT_TOKEN=123456:ABC...
EZTOR_TELEGRAM_CHAT_ID=123456789
```

#### Twilio SMS

```env
EZTOR_TWILIO_ACCOUNT_SID=AC...
EZTOR_TWILIO_AUTH_TOKEN=...
EZTOR_TWILIO_FROM_NUMBER=+1...
EZTOR_TWILIO_TO_NUMBER=+972...
```

אפשר להגדיר גם מייל וגם טלפון יחד. אם שניהם מוגדרים, הבוט ישלח לשני הערוצים.

## קבצים חשובים

- `src/index.js` - נקודת הכניסה.
- `src/bot.js` - הלוגיקה הראשית של בחירת תורים והזמנה.
- `src/booking-policy.js` - דירוג הסלוטים לפי העדיפויות שלך.
- `src/discovery.js` - חילוץ ספרים, תבניות ותורים עתידיים.
- `src/eztor-client.js` - הקריאות ל־API.
- `src/alert-service.js` - התרעות על טוקן לא תקף.
- `docker-compose.yml` - הרצה רציפה בשרת.

## הערות חשובות

- הבוט שומר טוקן מרוענן ב־`data/state.json` אם ה־API מחזיר `x-refreshed-token`.
- התאריכים נשמרים ב־UTC, אבל כל הבחירה וההצגה נעשות לפי `Asia/Jerusalem`.
- אם יש בחשבון תורים של ספרים אחרים, הבוט מתעלם מהם בחישוב הכיסוי השבועי של דור.
- כדי לקבל התרעות בפועל על חידוש טוקן, צריך למלא לפחות ערוץ אחד: Resend למייל, Telegram לטלפון, או Twilio ל־SMS.
