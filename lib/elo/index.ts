export type { EloTier } from "./types"
export type { EloConfig } from "./config"
export { defaultEloConfig, getEloConfig, getStartingEloForTier } from "./config"
export {
  computeEloMatch,
  expectedWinForWinnerRating,
  getPlayer1EloDeltaFromPrematchRatings,
  getPlayer1EloDeltaFromTiers,
  type EloMatchResult,
} from "./calculate"
