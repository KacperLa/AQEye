// BluetoothService.js - React Native Bluetooth service for AirQ Monitor
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import BleManager from 'react-native-ble-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Service and characteristic UUIDs (must match AirQ ESP32 device)
const AIRQ_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const LIVE_DATA_UUID = '12345678-1234-1234-1234-123456789abd';
const LOGGED_DATA_UUID = '12345678-1234-1234-1234-123456789abe';
const BATTERY_UUID = '12345678-1234-1234-1234-123456789abf';
const POWER_MODE_UUID = '12345678-1234-1234-1234-123456789ac0';

class BluetoothService {
  constructor() {
    this.device = null;
    this.deviceId = null;
    this.isConnected = false;
    this.isScanning = false;
    this.autoReconnecting = false;
    this.listeners = {
      connectionChange: [],
      airQualityUpdate: [],
      batteryUpdate: [],
      powerModeUpdate: [],
      error: [],
      autoConnectAttempt: []
    };
    
    // Storage keys for device persistence
    this.STORAGE_KEYS = {
      DEVICE_ID: 'airq_device_id',
      DEVICE_NAME: 'airq_device_name',
      AUTO_CONNECT: 'airq_auto_connect'
    };

    // Initialize BLE Manager
    this.initializeBleManager();
  }

  async initializeBleManager() {
    try {
      await BleManager.start({ showAlert: false });
      console.log('BLE Manager initialized');
      
      // Request permissions for Android
      if (Platform.OS === 'android') {
        await this.requestPermissions();
      }
    } catch (error) {
      console.error('Failed to initialize BLE Manager:', error);
      this.emit('error', 'Failed to initialize Bluetooth');
    }
  }

  async requestPermissions() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(granted).every(
        permission => permission === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'This app needs Bluetooth and Location permissions to function properly.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  }

  // Event listener management
  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // Check if device remembering is enabled
  async isRememberDeviceEnabled() {
    try {
      const enabled = await AsyncStorage.getItem(this.STORAGE_KEYS.AUTO_CONNECT);
      return enabled === 'true';
    } catch (error) {
      console.error('Error checking remember device setting:', error);
      return false;
    }
  }

  // Enable/disable device remembering
  async setRememberDevice(enabled) {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.AUTO_CONNECT, enabled.toString());
    } catch (error) {
      console.error('Error setting remember device:', error);
    }
  }

  // Get stored device info
  async getStoredDeviceInfo() {
    try {
      const deviceId = await AsyncStorage.getItem(this.STORAGE_KEYS.DEVICE_ID);
      const deviceName = await AsyncStorage.getItem(this.STORAGE_KEYS.DEVICE_NAME);
      return { deviceId, deviceName };
    } catch (error) {
      console.error('Error getting stored device info:', error);
      return { deviceId: null, deviceName: null };
    }
  }

  // Store device info
  async storeDeviceInfo(deviceId, deviceName) {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.DEVICE_ID, deviceId);
      await AsyncStorage.setItem(this.STORAGE_KEYS.DEVICE_NAME, deviceName);
    } catch (error) {
      console.error('Error storing device info:', error);
    }
  }

  // Forget stored device
  async forgetDevice() {
    try {
      await AsyncStorage.multiRemove([
        this.STORAGE_KEYS.DEVICE_ID,
        this.STORAGE_KEYS.DEVICE_NAME,
        this.STORAGE_KEYS.AUTO_CONNECT
      ]);
    } catch (error) {
      console.error('Error forgetting device:', error);
    }
  }

  // Scan for devices
  async scanForDevices() {
    try {
      if (this.isScanning) {
        return [];
      }

      this.isScanning = true;
      await BleManager.scan([], 60, true);
      
      // Wait for scan to complete
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const peripherals = await BleManager.getDiscoveredPeripherals();
      this.isScanning = false;
      
      // Log all discovered devices for debugging
      console.log('All discovered devices:', peripherals.map(d => ({
        name: d.name,
        id: d.id,
        rssi: d.rssi
      })));
      
      // Filter for ESP32 AirQ devices - temporarily more permissive
      return peripherals.filter(device => 
        device.name && (
          device.name.includes('AirQ Sensor') || 
          device.name.toLowerCase().includes('airq') ||
          device.name.toLowerCase().includes('air') ||
          // Temporarily allow all named devices for debugging
          device.name.length > 0
        )
      );
    } catch (error) {
      this.isScanning = false;
      console.error('Scan failed:', error);
      throw new Error('Failed to scan for devices');
    }
  }

  // Connect to device
  async connect() {
    try {
      const devices = await this.scanForDevices();
      
      if (devices.length === 0) {
        throw new Error('No AirQ devices found. Make sure your device is powered on and nearby.');
      }

      // For now, connect to the first found device
      // In a real app, you'd show a device picker
      const device = devices[0];
      await this.connectToDevice(device.id, device.name);
      
      return true;
    } catch (error) {
      console.error('Connection failed:', error);
      this.emit('error', error.message);
      throw error;
    }
  }

  // Connect to specific device
  async connectToDevice(deviceId, deviceName) {
    try {
      await BleManager.connect(deviceId);
      this.deviceId = deviceId;
      this.device = { id: deviceId, name: deviceName };
      this.isConnected = true;

      // Store device info for auto-connect
      await this.storeDeviceInfo(deviceId, deviceName);

      // Discover services
      await BleManager.retrieveServices(deviceId);

      // Start notifications for characteristics
      await this.startNotifications();

      this.emit('connectionChange', true);
      console.log('Connected to device:', deviceName);

    } catch (error) {
      console.error('Failed to connect to device:', error);
      throw new Error('Failed to connect to device');
    }
  }

  // Quick connect to remembered device
  async quickConnect() {
    try {
      this.emit('autoConnectAttempt', true);
      
      const { deviceId, deviceName } = await this.getStoredDeviceInfo();
      
      if (!deviceId) {
        throw new Error('No remembered device found');
      }

      await this.connectToDevice(deviceId, deviceName);
      return true;
    } catch (error) {
      console.error('Quick connect failed:', error);
      this.emit('autoConnectAttempt', false);
      return false;
    }
  }

  // Start notifications for all characteristics
  async startNotifications() {
    try {
      // Live Data notifications
      await BleManager.startNotification(
        this.deviceId,
        AIRQ_SERVICE_UUID,
        LIVE_DATA_UUID
      );

      // Battery notifications
      await BleManager.startNotification(
        this.deviceId,
        AIRQ_SERVICE_UUID,
        BATTERY_UUID
      );

      // Power Mode notifications
      await BleManager.startNotification(
        this.deviceId,
        AIRQ_SERVICE_UUID,
        POWER_MODE_UUID
      );

      // Set up notification handlers
      this.setupNotificationHandlers();

    } catch (error) {
      console.error('Failed to start notifications:', error);
    }
  }

  // Setup notification handlers
  setupNotificationHandlers() {
    // Live Data updates
    BleManager.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
      if (data.service === AIRQ_SERVICE_UUID && 
          data.characteristic === LIVE_DATA_UUID) {
        const airQualityData = this.parseAirQualityData(data.value);
        this.emit('airQualityUpdate', {
          ...airQualityData,
          timestamp: Date.now()
        });
      }
      
      // Battery updates
      else if (data.service === AIRQ_SERVICE_UUID && 
               data.characteristic === BATTERY_UUID) {
        const batteryLevel = this.parseBatteryData(data.value);
        this.emit('batteryUpdate', {
          batteryLevel,
          timestamp: Date.now()
        });
      }
      
      // Power Mode updates
      else if (data.service === AIRQ_SERVICE_UUID && 
               data.characteristic === POWER_MODE_UUID) {
        const powerMode = this.parsePowerModeData(data.value);
        this.emit('powerModeUpdate', {
          powerMode,
          timestamp: Date.now()
        });
      }
    });

    // Handle disconnection
    BleManager.addListener('BleManagerDisconnectPeripheral', (data) => {
      if (data.peripheral === this.deviceId) {
        this.handleDisconnection();
      }
    });
  }

  // Parse air quality data from comma-separated string
  parseAirQualityData(data) {
    try {
      if (!data || data.length === 0) {
        return { pm1: 0, pm25: 0, pm10: 0, aqi: 0, error: 'No data' };
      }

      // Convert byte array to string
      const dataString = String.fromCharCode.apply(null, data);
      console.log('Received AirQ data:', dataString);

      // Parse comma-separated values: "pm1,pm25,pm10,aqi"
      const values = dataString.split(',').map(val => parseFloat(val.trim()));
      
      if (values.length >= 4) {
        return {
          pm1: values[0] || 0,
          pm25: values[1] || 0,
          pm10: values[2] || 0,
          aqi: values[3] || 0,
          error: null
        };
      } else {
        return { pm1: 0, pm25: 0, pm10: 0, aqi: 0, error: 'Invalid data format' };
      }
    } catch (error) {
      console.error('Error parsing air quality data:', error);
      return { pm1: 0, pm25: 0, pm10: 0, aqi: 0, error: 'Parse error' };
    }
  }

  // Parse battery data
  parseBatteryData(data) {
    if (data && data.length >= 1) {
      return data[0]; // 8-bit percentage
    }
    return 0;
  }

  // Parse power mode data
  parsePowerModeData(data) {
    try {
      if (!data || data.length === 0) {
        return 'Unknown';
      }

      // Convert byte array to string
      const modeString = String.fromCharCode.apply(null, data);
      return modeString.trim();
    } catch (error) {
      console.error('Error parsing power mode data:', error);
      return 'Unknown';
    }
  }

  // Handle disconnection
  handleDisconnection() {
    this.isConnected = false;
    this.deviceId = null;
    this.device = null;
    this.emit('connectionChange', false);
    console.log('Device disconnected');
  }

  // Disconnect from device
  async disconnect() {
    try {
      if (this.deviceId) {
        await BleManager.disconnect(this.deviceId);
      }
      this.handleDisconnection();
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  }

  // Get device info
  async getDeviceInfo() {
    if (!this.device) {
      return {
        name: null,
        connected: false,
        services: []
      };
    }

    return {
      name: this.device.name,
      connected: this.isConnected,
      services: ['Air Quality', 'Battery', 'Power Mode']
    };
  }

  // Check if supported (always true for React Native)
  isSupported() {
    return true;
  }
}

export default BluetoothService;
