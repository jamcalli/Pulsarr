// CJS wrapper — Knex does require('better-sqlite3') and expects the constructor directly
const { Database } = require('./index.ts')
module.exports = Database
module.exports.default = Database
module.exports.Database = Database
