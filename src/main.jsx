import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRegistry } from 'react-native';
import App from './App';

// Register the app
AppRegistry.registerComponent('DinkShuffle', () => App);

// Run the app on web
AppRegistry.runApplication('DinkShuffle', {
  rootTag: document.getElementById('root'),
});
