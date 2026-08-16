import { createElement } from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// This file is .ts, not .tsx, so createElement() is used instead of JSX.
function Root(): React.JSX.Element {
  return createElement(ErrorBoundary, null, createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
