# SpO2 Monitor Mobile App

A React Native mobile application for real-time blood oxygen saturation (SpO2) and heart rate monitoring via Bluetooth connectivity with ESP32-C3 microcontroller.

## Features

- **Real-time Data Monitoring**: Live SpO2, heart rate, and battery level readings
- **Bluetooth Connectivity**: Connect to ESP32-C3 SpO2 monitoring device
- **Interactive Charts**: Visual representation of historical data trends
- **Modern UI**: Dark theme with glassmorphism effects and gradient backgrounds
- **Device Management**: Remember devices for quick reconnection
- **Cross-platform**: Runs on both iOS and Android

## Prerequisites

- Node.js 18 or higher
- Expo CLI installed globally (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development) or Android Studio (for Android development)
- Physical device with Bluetooth capability for testing

## Installation

1. Navigate to the project directory:
   ```bash
   cd spo2-mobile-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## Running the App

### iOS
```bash
npm run ios
```

### Android
```bash
npm run android
```

### Web (limited functionality)
```bash
npm run web
```

**Note**: Web version has limited functionality as Bluetooth APIs are not available in web browsers.

## GitHub Pages Deployment

This app can be deployed to GitHub Pages as a web application. The web version will have limited functionality (no Bluetooth support) but can demonstrate the UI and basic features.

### Automatic Deployment
The repository includes a GitHub Actions workflow that automatically deploys to GitHub Pages when changes are pushed to the main branch.

### Manual Deployment
To deploy manually:

1. Update the `homepage` field in `package.json` with your GitHub Pages URL:
   ```json
   "homepage": "https://yourusername.github.io/repository-name"
   ```

2. Build and deploy:
   ```bash
   npm run deploy
   ```

### Accessing the Deployed App
Once deployed, the app will be available at: `https://yourusername.github.io/repository-name`

**Important**: The web version will not have Bluetooth functionality, so it will primarily show the UI and simulated data.

## Hardware Requirements

- ESP32-C3 microcontroller
- MAX30102 pulse oximeter sensor
- Proper wiring as specified in the Arduino project documentation

## App Configuration

### iOS Permissions
The app requires the following iOS permissions (configured in `app.json`):
- `NSBluetoothAlwaysUsageDescription`: For Bluetooth device connection
- `NSBluetoothPeripheralUsageDescription`: For Bluetooth peripheral access
- `NSLocationWhenInUseUsageDescription`: Required by iOS for BLE scanning

### Android Permissions
The app requires the following Android permissions:
- `BLUETOOTH`
- `BLUETOOTH_ADMIN`
- `BLUETOOTH_CONNECT`
- `BLUETOOTH_SCAN`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

## Key Components

### App.js
Main application component that manages:
- Bluetooth connection state
- Real-time data reception
- UI state management
- Device information handling

### services/BluetoothService.js
Bluetooth Low Energy service for:
- Device discovery and connection
- Data characteristic subscriptions
- Connection state management
- Error handling

### components/MetricCard.js
Display component for individual metrics:
- Heart rate monitoring
- SpO2 levels
- Battery status
- Status indicators with color coding

### components/DataChart.js
Chart component for historical data:
- Real-time trend visualization
- Customizable time ranges
- Interactive tooltips
- Mobile-optimized rendering

### components/ConnectionSection.js
Connection management interface:
- Device pairing controls
- Auto-connect functionality
- Device information display
- Error handling and status

## Building for Production

### iOS
1. Configure your bundle identifier in `app.json`
2. Build for iOS:
   ```bash
   expo build:ios
   ```

### Android
1. Configure your package name in `app.json`
2. Build for Android:
   ```bash
   expo build:android
   ```

## Data Flow

1. **Connection**: App discovers and connects to ESP32-C3 device
2. **Subscription**: Subscribes to heart rate, SpO2, and battery characteristics
3. **Data Reception**: Receives real-time data updates via BLE notifications
4. **Processing**: Validates and processes incoming sensor data
5. **Display**: Updates UI with current readings and historical trends
6. **Storage**: Maintains local history for chart visualization

## Troubleshooting

### Bluetooth Connection Issues
- Ensure device is powered on and advertising
- Check Bluetooth permissions are granted
- Verify device is not connected to another app
- Try forgetting and re-pairing the device

### iOS Specific Issues
- Ensure iOS deployment target is 13.0 or higher
- Check that location permissions are granted (required for BLE)
- Verify app is signed with proper provisioning profile

### Android Specific Issues
- Enable location services (required for BLE scanning)
- Check that all Bluetooth permissions are granted
- Ensure target SDK version is compatible

## Development

### Project Structure
```
spo2-mobile-app/
├── App.js                 # Main application component
├── app.json              # Expo configuration
├── package.json          # Dependencies and scripts
├── services/
│   └── BluetoothService.js # BLE service implementation
└── components/
    ├── MetricCard.js     # Metric display component
    ├── DataChart.js      # Chart visualization component
    └── ConnectionSection.js # Connection management UI
```

### Adding New Features
1. Create new components in the `components/` directory
2. Add new services in the `services/` directory
3. Update `App.js` to integrate new functionality
4. Test on both iOS and Android platforms

## Related Projects

- **Arduino ESP32-C3 Code**: Hardware implementation for SpO2 monitoring
- **React Web App**: Web-based version with similar functionality

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the Arduino project documentation
3. Ensure proper hardware setup and wiring
4. Verify Bluetooth permissions and device compatibility
