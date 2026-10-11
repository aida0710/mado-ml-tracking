import { Component, type ReactNode } from 'react';
import { text } from '../i18n/catalog';
import { useLocale } from '../i18n/useLocale';
import { LanguagePicker } from './LanguagePicker';

function FatalError() {
  useLocale();
  return (
    <main className="fatal-error">
      <LanguagePicker />
      <h1>{text.unexpectedError}</h1>
      <button className="button primary" onClick={() => location.reload()}>
        {text.reloadApp}
      </button>
    </main>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <FatalError />;
    return this.props.children;
  }
}
