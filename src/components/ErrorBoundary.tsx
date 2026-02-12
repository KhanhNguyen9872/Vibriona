import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../store/useSettingsStore';

// Wrapper for hooks because class components can't use hooks directly
const withHooks = (Component: any) => {
  return (props: any) => {
    const { t } = useTranslation();
    const theme = useSettingsStore((state) => state.theme);
    
    // Ensure theme is applied ensuring fallback UI matches user preference
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    return <Component {...props} t={t} theme={theme} />;
  };
};

interface Props {
  children: ReactNode;
  t: (key: string) => string;
  theme: 'light' | 'dark';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-neutral-950 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
              {this.props.t('errors.title')}
            </h2>
            
            <p className="text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed">
              {this.props.t('errors.description')}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-4 h-4" />
                {this.props.t('errors.reload')}
              </button>
              
              {import.meta.env.DEV && this.state.error && (
                <div className="mt-6 text-left p-4 bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-auto max-h-48">
                  <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
                    {this.state.error.toString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withHooks(ErrorBoundary);
