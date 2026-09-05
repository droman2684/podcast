import { createElement } from 'react';
import { registerRootComponent } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// This file is .ts, not .tsx, so createElement() is used instead of JSX.
// GestureHandlerRootView wraps everything so the drag-to-reorder gestures in
// Queue/Downloads (react-native-draggable-flatlist) work anywhere in the
// tree, not just under a screen that happens to declare its own.
function Root(): React.JSX.Element {
  return createElement(
    GestureHandlerRootView,
    { style: { flex: 1 } },
    createElement(ErrorBoundary, null, createElement(App))
  );
}

registerRootComponent(Root);
