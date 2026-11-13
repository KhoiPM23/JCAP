import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[360px] w-full flex-col items-center justify-center p-8 text-center bg-white rounded-3xl border border-red-200 shadow-sm font-sans my-4 select-none">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 mb-4 shadow-xs">
            ⚠️
          </div>
          <h2 className="text-base font-bold text-slate-800">
            {this.props.fallbackTitle || 'Đã xảy ra lỗi hiển thị tạm thời'}
          </h2>
          <p className="mt-2 max-w-md text-xs text-slate-500 leading-relaxed">
            Hệ thống đã tự động bảo vệ phiên luyện tập của bạn an toàn. Bạn có thể bấm tiếp tục hoặc làm mới để khôi phục giao diện.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-xl bg-[var(--ai)] text-white text-xs font-bold shadow-xs hover:opacity-90 active:scale-95 transition cursor-pointer"
            >
              Tiếp tục phiên
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-95 transition cursor-pointer"
            >
              Tải lại trang (F5)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

