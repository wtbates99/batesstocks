import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  message?: string
}

const LOCAL_STATE_KEY = 'batesstocks-terminal'
const RECOVERY_FLAG = 'batesstocks-terminal-recovery-attempted'

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: undefined,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('BATESSTOCKS render failure', error, errorInfo)

    if (typeof window === 'undefined') return

    const alreadyRetried = window.sessionStorage.getItem(RECOVERY_FLAG) === '1'
    if (alreadyRetried) return

    try {
      window.sessionStorage.setItem(RECOVERY_FLAG, '1')
      window.localStorage.removeItem(LOCAL_STATE_KEY)
      window.location.replace(window.location.pathname || '/')
    } catch {
      // Fall through to the visible recovery UI if storage access is blocked.
    }
  }

  handleReset = () => {
    try {
      window.sessionStorage.removeItem(RECOVERY_FLAG)
      window.localStorage.removeItem(LOCAL_STATE_KEY)
    } catch {
      // Ignore storage cleanup failures and still attempt a reload.
    }
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="state-panel error-state app-error-boundary">
        <div className="panel-title">Workspace failed to load</div>
        <p className="error-copy">
          The browser saved data for this app is incompatible or corrupted. Reset the local workspace and reload.
        </p>
        {this.state.message && <p className="error-copy">{this.state.message}</p>}
        <button type="button" className="terminal-button" onClick={this.handleReset}>
          Reset local workspace
        </button>
      </div>
    )
  }
}
