/**
 * Fleet introspection — TRD 21.
 *
 * Reads the agent sessions already running on this machine and turns them into
 * something the board can hold. Deliberately free of any database import: this
 * is a separate tsup entry so the CLI can pull it in without dragging
 * `better-sqlite3` along, exactly as `score/` is.
 *
 * Nothing here reaches the network. Scanning produces values; uploading them is
 * the caller's decision and the caller's consent to obtain.
 */
export {
  HEAD_BYTES,
  MAX_PROBE_BYTES,
  readHead,
  probeTranscript,
  type SessionObservation,
  type ProbeOptions,
} from './transcript';

export {
  parseRemoteUrl,
  resolveRepo,
  resolveBranch,
  resolveTouchedPaths,
  clearRepoCache,
  type RepoIdentity,
} from './repo';

export {
  scanSessions,
  adoptionKeyFor,
  loadOwnedSessionIds,
  defaultProjectsRoot,
  condenseTitle,
  heuristicTitle,
  groupByOwner,
  withheldOwners,
  type ScanOptions,
  type ScanResult,
  type SkipReason,
  type SkippedSession,
} from './scanner';

export {
  summarizeSession,
  summarizeSessions,
  heuristicSummary,
  type SummarizeOptions,
  type SessionSummary,
} from './summarize';
