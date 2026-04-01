/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// v30: Headless JS Task for Background Scanning
AppRegistry.registerHeadlessTask('RecordingScanTask', () => async (taskData) => {
    console.log('RecordingScanTask started:', taskData);
    try {
        // v30 Fix: On some devices, taskData arrives as a JSON string
        const data = typeof taskData === 'string' ? JSON.parse(taskData) : taskData;
        
        // Import background logic only when needed
        const { syncBackgroundRecordings } = await import('./src/utils/BackgroundSync');
        await syncBackgroundRecordings(data);
    } catch (error) {
        console.error('RecordingScanTask failed:', error);
    }
});
