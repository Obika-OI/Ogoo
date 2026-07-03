import { AppRegistry } from 'react-native';
import App from './App';
import appName from './app.json';

// @ts-ignore
AppRegistry.registerComponent(appName.name, () => App);
