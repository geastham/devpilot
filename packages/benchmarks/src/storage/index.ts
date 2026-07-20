/**
 * Storage Module
 *
 * Version tagging, results writing, and history reading.
 */

export {
  getVersionInfo,
  getGitCommit,
  getGitBranch,
  getGitTag,
  getGitDescribe,
  isWorkingTreeDirty,
  sanitizeVersionForPath,
  createTimestampPath,
  parseTimestampPath,
} from './version-tagger';

export { ResultsWriter, createResultsWriter } from './results-writer';
export type { ResultsWriterConfig } from './results-writer';

export { HistoryReader, createHistoryReader } from './history-reader';
export type { HistoryReaderConfig } from './history-reader';
