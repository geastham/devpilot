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

export {
  ResultsWriter,
  ResultsWriterConfig,
  createResultsWriter,
} from './results-writer';

export {
  HistoryReader,
  HistoryReaderConfig,
  createHistoryReader,
} from './history-reader';
