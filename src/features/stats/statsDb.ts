import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { MatchRecord } from './types'

/** Match history in IndexedDB: it grows over time, which localStorage is not made for. */
interface CardsDb extends DBSchema {
  matches: {
    key: number
    value: MatchRecord
    indexes: { byEnd: number; byGame: string }
  }
}

const DB_NAME = 'cards'
let connection: Promise<IDBPDatabase<CardsDb>> | null = null

function db() {
  connection ??= openDB<CardsDb>(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore('matches', { keyPath: 'id', autoIncrement: true })
      store.createIndex('byEnd', 'endedAt')
      store.createIndex('byGame', 'gameId')
    },
  })
  return connection
}

export async function addMatch(record: Omit<MatchRecord, 'id'>): Promise<number> {
  return (await db()).add('matches', record as MatchRecord)
}

/** All matches, newest first. */
export async function listMatches(): Promise<MatchRecord[]> {
  const all = await (await db()).getAllFromIndex('matches', 'byEnd')
  return all.reverse()
}

export async function clearMatches(): Promise<void> {
  await (await db()).clear('matches')
}

/** Tests only: forget the open connection so a fresh (fake) database can be used. */
export async function resetStatsDbForTests(): Promise<void> {
  const open = connection
  connection = null
  ;(await open)?.close()
}
