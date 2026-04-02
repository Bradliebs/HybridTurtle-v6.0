'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary for dashboard sections.
 * Catches render errors and displays a fallback instead of crashing the whole page.
 *
 * Usage:
 *   <ErrorBoundary section="Portfolio">
 *     <PortfolioPanel />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">
            {this.props.section ? `${this.props.section} failed to load` : 'Something went wrong'}
          </p>
          <p className="mt-1 text-xs opacity-75">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
