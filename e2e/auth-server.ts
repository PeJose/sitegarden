// The real server with a hash of the test password (made here, so no secret is checked in) and the test API token.
import { hashPassword } from '../server/auth'
import { PASSWORD, TOKEN } from './creds'

process.env.SITEGARDEN_PASSWORD_HASH = await hashPassword(PASSWORD)
process.env.SITEGARDEN_API_TOKEN = TOKEN
await import('../server/index')
