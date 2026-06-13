import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('data', { recursive: true })
writeFileSync('data/build.json', JSON.stringify({ buildDate: new Date().toISOString() }))
