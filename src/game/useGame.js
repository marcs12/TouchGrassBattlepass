import { hasCloud } from '../lib/supabase'
import { useCloudGame } from './cloudBackend'
import { useLocalGame } from './localBackend'

/**
 * One game, two backends. Which one runs is fixed at build time by whether
 * Supabase credentials exist, so the hook order never changes between renders.
 */
export const useGame = hasCloud ? useCloudGame : useLocalGame
