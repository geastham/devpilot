/**
 * The cockpit's plan-rendering components now live in `@devpilot.sh/cockpit-ui`
 * so the hosted plane renders the *same* cockpit rather than a second
 * implementation that drifts from this one.
 *
 * This barrel stays as the app's import path — every call site keeps working —
 * but it forwards. Nothing is defined here any more.
 */
export {
  DAGVisualization,
  CriticalPathIndicator,
  WaveProgressBar,
  WaveTableView,
} from '@devpilot.sh/cockpit-ui';
