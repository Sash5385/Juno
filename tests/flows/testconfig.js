import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getDatabase, connectDatabaseEmulator } from 'firebase/database'
export const app = initializeApp({ apiKey: 'x', projectId: 'demo-flow', databaseURL: 'https://demo-flow-default-rtdb.firebaseio.com' }, globalThis.__APPNAME || 'student')
export const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
export const db = getDatabase(app)
connectDatabaseEmulator(db, '127.0.0.1', 9000)
