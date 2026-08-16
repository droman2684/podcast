import { createElement } from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// This file is .ts, not .tsx, so createElement() is used instead of JSX.
function Root(): React.JSX.Element {
  return createElement(ErrorBoundary, null, createElement(App));
}

registerRootComponent(Root);
