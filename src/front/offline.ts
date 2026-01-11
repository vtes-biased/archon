/**
 * Offline mode management for tournament console.
 * Uses IndexedDB to persist tournament state and offline members.
 */
import * as idb from 'idb'
import * as d from "./d"

const DB_NAME = 'ArchonOffline'
const DB_VERSION = 1
const STORE_TOURNAMENTS = 'offline_tournaments'

export interface OfflineTournamentData {
    tournament_uid: string
    tournament: d.Tournament
    offline_members: d.OfflineMember[]
    owner_uid: string
    taken_offline_at: string
}

let dbPromise: Promise<idb.IDBPDatabase> | null = null

async function getDB(): Promise<idb.IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_TOURNAMENTS)) {
                    db.createObjectStore(STORE_TOURNAMENTS, { keyPath: 'tournament_uid' })
                }
            },
            blocked() {
                console.warn('Offline DB blocked - another tab has an older version')
            },
            blocking() {
                console.warn('Offline DB blocking - closing for upgrade')
            },
            terminated() {
                console.error('Offline DB terminated unexpectedly')
                dbPromise = null
            },
        })
    }
    return dbPromise
}

/**
 * Check if we have offline data for a tournament
 */
export async function isOffline(tournament_uid: string): Promise<boolean> {
    const data = await getOfflineTournament(tournament_uid)
    return data !== null
}

/**
 * Check if the current user is the offline owner
 */
export async function isOfflineOwner(tournament_uid: string, user_uid: string): Promise<boolean> {
    const data = await getOfflineTournament(tournament_uid)
    return data !== null && data.owner_uid === user_uid
}

/**
 * Initialize offline mode - store current tournament state
 */
export async function goOffline(tournament: d.Tournament, owner_uid: string): Promise<void> {
    const db = await getDB()
    const data: OfflineTournamentData = {
        tournament_uid: tournament.uid,
        tournament: tournament,
        offline_members: [],
        owner_uid: owner_uid,
        taken_offline_at: new Date().toISOString(),
    }
    await db.put(STORE_TOURNAMENTS, data)
}

/**
 * Get current offline tournament state
 */
export async function getOfflineTournament(tournament_uid: string): Promise<OfflineTournamentData | null> {
    const db = await getDB()
    const data = await db.get(STORE_TOURNAMENTS, tournament_uid)
    return data || null
}

/**
 * Update offline tournament state (after local event application)
 */
export async function updateOfflineTournament(tournament: d.Tournament): Promise<void> {
    const db = await getDB()
    const existing = await db.get(STORE_TOURNAMENTS, tournament.uid)
    if (!existing) {
        console.error('Cannot update offline tournament - not in offline mode')
        return
    }
    existing.tournament = tournament
    await db.put(STORE_TOURNAMENTS, existing)
}

/**
 * Add an offline member
 */
export async function addOfflineMember(tournament_uid: string, member: d.OfflineMember): Promise<void> {
    const db = await getDB()
    const existing = await db.get(STORE_TOURNAMENTS, tournament_uid)
    if (!existing) {
        console.error('Cannot add offline member - not in offline mode')
        return
    }
    existing.offline_members.push(member)
    await db.put(STORE_TOURNAMENTS, existing)
}

/**
 * Get all offline members for a tournament
 */
export async function getOfflineMembers(tournament_uid: string): Promise<d.OfflineMember[]> {
    const data = await getOfflineTournament(tournament_uid)
    return data?.offline_members || []
}

/**
 * Clear offline data (after successful sync or force online)
 */
export async function clearOffline(tournament_uid: string): Promise<void> {
    const db = await getDB()
    await db.delete(STORE_TOURNAMENTS, tournament_uid)
}

/**
 * Cache the console page for offline access via service worker
 * Non-blocking - failures don't prevent going offline
 */
export async function cacheConsolePageForOffline(tournament_uid: string): Promise<void> {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker not available')
        return
    }

    // Wait for SW ready with a timeout
    let registration: ServiceWorkerRegistration | null = null
    try {
        registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
        ])
    } catch (e) {
        console.warn('Service Worker not ready:', e)
        return
    }

    if (!registration?.active) {
        console.warn('No active service worker')
        return
    }

    const consoleUrl = `/tournament/${tournament_uid}/console.html`

    // Use MessageChannel for response
    const messageChannel = new MessageChannel()

    return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
            if (event.data.success) {
                console.log('Cached console page for offline:', consoleUrl)
            } else {
                console.warn('Failed to cache console page:', event.data.error)
            }
            resolve()
        }

        registration!.active!.postMessage(
            { type: 'CACHE_CONSOLE_PAGE', url: consoleUrl },
            [messageChannel.port2]
        )

        // Timeout after 5 seconds - don't block going offline
        setTimeout(() => resolve(), 5000)
    })
}

/**
 * Register the service worker
 * Uses dynamic URL construction to avoid Parcel's service worker bundling
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker not supported')
        return null
    }

    try {
        // Construct URL dynamically to bypass Parcel's service worker detection
        const swPath = ['/static', 'sw.js'].join('/')
        const registration = await navigator.serviceWorker.register(swPath, {
            scope: '/',
        })
        console.log('Service Worker registered:', registration.scope)
        return registration
    } catch (e) {
        console.error('Service Worker registration failed:', e)
        return null
    }
}

/**
 * Prepare sync data to send to server
 */
export async function prepareSyncData(tournament_uid: string): Promise<d.OfflineSyncData | null> {
    const data = await getOfflineTournament(tournament_uid)
    if (!data) {
        return null
    }
    return {
        tournament: data.tournament,
        offline_members: data.offline_members,
    }
}

