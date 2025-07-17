// Platform-aware Bluetooth Service for Expo React Native
// Supports both mobile (react-native-ble-plx) and web (Web Bluetooth API)

import { Platform } from 'react-native';

// BLE Service and Characteristic UUIDs (matching AirQ Arduino code)
const AIRQ_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const LIVE_DATA_UUID = '12345678-1234-1234-1234-123456789abd';
const LOGGED_DATA_UUID = '12345678-1234-1234-1234-123456789abe';
const BATTERY_UUID = '12345678-1234-1234-1234-123456789abf';
const POWER_MODE_UUID = '12345678-1234-1234-1234-123456789ac0';
const RTC_TIME_UUID = '12345678-1234-1234-1234-123456789ac1';
const CHUNK_INFO_UUID = '12345678-1234-1234-1234-123456789ac2';
const CHUNK_REQUEST_UUID = '87654321-4321-4321-4321-cba987654321';

const DEVICE_NAME = 'AirQ Sensor';

// Storage keys for device persistence
const STORAGE_KEYS = {
  DEVICE_ID: 'airq_device_id',
  DEVICE_NAME: 'airq_device_name',
  AUTO_CONNECT: 'airq_auto_connect'
};

class PlatformBluetoothService {
  constructor() {
    this.isWeb = Platform.OS === 'web';
    this.device = null;
    this.isConnected = false;
    this.airQualityCallback = null;
    this.batteryCallback = null;
    this.powerModeCallback = null;
    this.connectionCallback = null;
    this.errorCallback = null;
    this.autoConnectAttemptCallback = null;
    
    // Event listeners storage
    this.listeners = {
      connectionChange: [],
      airQualityUpdate: [],
      batteryUpdate: [],
      powerModeUpdate: [],
      error: [],
      autoConnectAttempt: [],
      downloadProgress: []
    };
    
    // Initialize platform-specific service
    if (this.isWeb) {
      this.initWebService();
    } else {
      this.initMobileService();
    }  }

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

  // Initialize Web Bluetooth service
  initWebService() {
    this.server = null;
    this.liveDataCharacteristic = null;
    this.loggedDataCharacteristic = null;
    this.batteryCharacteristic = null;
    this.powerModeCharacteristic = null;
    this.rtcTimeCharacteristic = null;
    this.chunkInfoCharacteristic = null;
    this.chunkRequestCharacteristic = null;
  }

  // Initialize mobile BLE service
  async initMobileService() {
    try {
      const { BleManager } = await import('react-native-ble-plx');
      const { PermissionsAndroid } = await import('react-native');
      
      this.manager = new BleManager();
      this.PermissionsAndroid = PermissionsAndroid;
    } catch (error) {
      console.error('Failed to initialize mobile BLE service:', error);
    }
  }

  // Check if Bluetooth is supported
  isSupported() {
    if (this.isWeb) {
      return 'bluetooth' in navigator;
    }
    return this.manager !== null;
  }

  // Storage helpers (cross-platform)
  getStorageItem(key) {
    if (this.isWeb) {
      return localStorage.getItem(key);
    } else {
      // For React Native, you would use AsyncStorage
      // For now, we'll use a simple in-memory storage
      return this._storage?.[key] || null;
    }
  }

  setStorageItem(key, value) {
    if (this.isWeb) {
      localStorage.setItem(key, value);
    } else {
      // For React Native, you would use AsyncStorage
      // For now, we'll use a simple in-memory storage
      if (!this._storage) this._storage = {};
      this._storage[key] = value;
    }
  }

  removeStorageItem(key) {
    if (this.isWeb) {
      localStorage.removeItem(key);
    } else {
      if (this._storage) {
        delete this._storage[key];
      }
    }
  }

  // Device remembering functions
  isRememberDeviceEnabled() {
    return this.getStorageItem(STORAGE_KEYS.AUTO_CONNECT) === 'true';
  }

  setRememberDevice(enabled) {
    this.setStorageItem(STORAGE_KEYS.AUTO_CONNECT, enabled.toString());
  }

  getStoredDeviceInfo() {
    const deviceId = this.getStorageItem(STORAGE_KEYS.DEVICE_ID);
    const deviceName = this.getStorageItem(STORAGE_KEYS.DEVICE_NAME);
    return deviceId ? { id: deviceId, name: deviceName } : null;
  }

  storeDeviceInfo(device) {
    this.setStorageItem(STORAGE_KEYS.DEVICE_ID, device.id);
    this.setStorageItem(STORAGE_KEYS.DEVICE_NAME, device.name || DEVICE_NAME);
    this.setStorageItem(STORAGE_KEYS.AUTO_CONNECT, 'true');
    console.log('Device info stored for quick connect');
  }

  clearStoredDeviceInfo() {
    this.removeStorageItem(STORAGE_KEYS.DEVICE_ID);
    this.removeStorageItem(STORAGE_KEYS.DEVICE_NAME);
    this.removeStorageItem(STORAGE_KEYS.AUTO_CONNECT);
  }

  // Platform-specific scanning methods
  async startScanning(onDeviceFound) {
    if (this.isWeb) {
      return this.startWebScanning(onDeviceFound);
    } else {
      return this.startMobileScanning(onDeviceFound);
    }
  }

  // Web Bluetooth scanning
  async startWebScanning(onDeviceFound) {
    try {
      if (!this.isSupported()) {
        throw new Error('Web Bluetooth is not supported in this browser');
      }

      console.log('Starting Web Bluetooth scan...');
      
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { name: DEVICE_NAME },
          { namePrefix: 'AirQ' }
        ],
        optionalServices: [
          AIRQ_SERVICE_UUID
        ]
      });

      console.log('Web Bluetooth device selected:', device.name, device.id);
      onDeviceFound(device);
      
    } catch (error) {
      console.error('Web Bluetooth scan error:', error);
      throw error;
    }
  }

  // Mobile BLE scanning
  async startMobileScanning(onDeviceFound) {
    try {
      const hasPermissions = await this.requestMobilePermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions not granted');
      }

      const state = await this.manager.state();
      if (state !== 'PoweredOn') {
        throw new Error('Bluetooth is not enabled');
      }

      console.log('Starting mobile BLE scan...');
      
      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Mobile BLE scan error:', error);
          return;
        }

        if (device && (device.name === DEVICE_NAME || device.name?.includes('AirQ'))) {
          console.log('Found AirQ device:', device.id);
          this.manager.stopDeviceScan();
          onDeviceFound(device);
        }
      });

      // Stop scanning after 30 seconds
      setTimeout(() => {
        this.manager.stopDeviceScan();
      }, 30000);

    } catch (error) {
      console.error('Mobile BLE scan error:', error);
      throw error;
    }
  }

  // Request mobile permissions
  async requestMobilePermissions() {
    if (Platform.OS === 'android' && this.PermissionsAndroid) {
      const granted = await this.PermissionsAndroid.requestMultiple([
        this.PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        this.PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        this.PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      
      return Object.values(granted).every(
        permission => permission === this.PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }

  // Platform-specific connection methods
  async connectToDevice(device) {
    if (this.isWeb) {
      return this.connectWebDevice(device);
    } else {
      return this.connectMobileDevice(device);
    }
  }

  // Web Bluetooth connection
  async connectWebDevice(device) {
    try {
      console.log('Connecting to Web Bluetooth device:', device.id);
      
      this.device = device;
      
      // Handle disconnection events before connecting
      device.addEventListener('gattserverdisconnected', () => {
        console.log('Web Bluetooth device disconnected');
        this.stopPolling();
        this.isConnected = false;
        this.device = null;
        this.server = null;
        if (this.connectionCallback) {
          this.connectionCallback(false);
        }
        this.emit('connectionChange', false);
      });
      
      // Connect to GATT server
      this.server = await device.gatt.connect();
      console.log('Web Bluetooth connected successfully');
      
      // Add a small delay to ensure connection is stable
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if still connected
      if (!this.server || !this.server.connected) {
        throw new Error('Connection lost immediately after connecting');
      }
      
      this.isConnected = true;
      
      // Set up notifications with error handling - don't let this fail the connection
      try {
        const notificationsSuccess = await this.setupWebNotifications();
        
        if (!notificationsSuccess) {
          console.log('Notifications failed, falling back to polling...');
          this.startPolling();
        } else {
          console.log('Using GATT notifications - no polling needed');
        }
      } catch (error) {
        console.error('Notification setup failed, but continuing with connection:', error);
        // Connection is still valid even if notifications fail
        console.log('Starting polling as fallback mechanism...');
        this.startPolling();
      }
      
      if (this.connectionCallback) {
        this.connectionCallback(true);
      }
      
      this.emit('connectionChange', true);

      return true;
    } catch (error) {
      console.error('Web Bluetooth connection error:', error);
      this.isConnected = false;
      this.device = null;
      this.server = null;
      this.emit('error', error.message);
      throw error;
    }
  }

  // Mobile BLE connection
  async connectMobileDevice(device) {
    try {
      console.log('Connecting to mobile BLE device:', device.id);
      
      this.device = await device.connect();
      console.log('Mobile BLE connected successfully');
      
      // Discover services and characteristics
      await this.device.discoverAllServicesAndCharacteristics();
      console.log('Mobile BLE services discovered');
      
      this.isConnected = true;
      
      // Set up notifications
      const notificationsSuccess = await this.setupMobileNotifications();
      
      if (!notificationsSuccess) {
        console.log('Notifications failed, falling back to polling...');
        this.startMobilePolling();
      } else {
        console.log('Using BLE notifications - no polling needed');
      }
      
      if (this.connectionCallback) {
        this.connectionCallback(true);
      }
      
      this.emit('connectionChange', true);      // Handle disconnection
      this.device.onDisconnected(() => {
        console.log('Mobile BLE device disconnected');
        this.isConnected = false;
        this.device = null;
        if (this.connectionCallback) {
          this.connectionCallback(false);
        }
        this.emit('connectionChange', false);
      });

      return true;    } catch (error) {
      console.error('Mobile BLE connection error:', error);
      this.isConnected = false;
      this.device = null;
      this.emit('error', error.message);
      throw error;
    }
  }

  // Web Bluetooth notifications setup
  async setupWebNotifications() {
    let notificationsSetup = false;
    
    try {
      console.log('Setting up Web Bluetooth notifications...');
      
      // Check if server is still connected
      if (!this.server || !this.server.connected) {
        console.error('GATT server is not connected');
        return false;
      }
      
      // Get AirQ Service with better error handling
      let airqService;
      try {
        airqService = await this.server.getPrimaryService(AIRQ_SERVICE_UUID);
        console.log('AirQ service found');
        
        // Debug: List all available characteristics
        await this.debugListCharacteristics();
      } catch (error) {
        console.error('Failed to get AirQ service:', error);
        console.log('Available services might be limited. Trying to continue...');
        return false;
      }
      
      // Set up Live Data characteristic (most important)
      try {
        this.liveDataCharacteristic = await airqService.getCharacteristic(LIVE_DATA_UUID);
        
        // Try to start notifications
        try {
          await this.liveDataCharacteristic.startNotifications();
          console.log('Live data notifications started successfully');
          notificationsSetup = true;
          
          this.liveDataCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const dataString = new TextDecoder().decode(value);
            console.log('Received AirQ data via notification:', dataString);
            
            // Parse comma-separated values: "pm1,pm25,pm10,battery"
            const values = dataString.split(',').map(val => parseFloat(val.trim()));
            
            if (values.length >= 4) {
              const pm25 = values[1] || 0;
              const calculatedAqi = this.calculateAQI(pm25);
              
              const eventData = {
                pm1: values[0] || 0,
                pm25: pm25,
                pm10: values[2] || 0,
                battery: values[3] || 0,
                aqi: calculatedAqi,
                error: null,
                timestamp: Date.now()
              };
              
              if (this.airQualityCallback) {
                this.airQualityCallback(eventData);
              }
              
              this.emit('airQualityUpdate', eventData);
            }
          });
        } catch (notifError) {
          console.error('Failed to start live data notifications:', notifError);
          // Try to read the characteristic directly as fallback
          try {
            const value = await this.liveDataCharacteristic.readValue();
            const dataString = new TextDecoder().decode(value);
            console.log('Read live data directly:', dataString);
          } catch (readError) {
            console.error('Failed to read live data:', readError);
          }
        }
      } catch (error) {
        console.error('Failed to get live data characteristic:', error);
      }

      // Set up Battery characteristic (optional)
      try {
        this.batteryCharacteristic = await airqService.getCharacteristic(BATTERY_UUID);
        
        try {
          await this.batteryCharacteristic.startNotifications();
          console.log('Battery notifications started successfully');
          
          this.batteryCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const data = new Uint8Array(value.buffer);
            const batteryLevel = data[0];
            
            const eventData = {
              batteryLevel: batteryLevel,
              timestamp: Date.now()
            };
            
            if (this.batteryCallback) {
              this.batteryCallback(batteryLevel);
            }
            
            this.emit('batteryUpdate', eventData);
          });
        } catch (notifError) {
          console.error('Failed to start battery notifications:', notifError);
        }
      } catch (error) {
        console.error('Failed to get battery characteristic:', error);
      }

      // Set up Power Mode characteristic (optional)
      try {
        this.powerModeCharacteristic = await airqService.getCharacteristic(POWER_MODE_UUID);
        
        try {
          await this.powerModeCharacteristic.startNotifications();
          console.log('Power mode notifications started successfully');
          
          this.powerModeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const modeString = new TextDecoder().decode(value);
            
            const eventData = {
              powerMode: modeString.trim(),
              timestamp: Date.now()
            };
            
            if (this.powerModeCallback) {
              this.powerModeCallback(modeString.trim());
            }
            
            this.emit('powerModeUpdate', eventData);
          });
        } catch (notifError) {
          console.error('Failed to start power mode notifications:', notifError);
        }
      } catch (error) {
        console.error('Failed to get power mode characteristic:', error);
      }

      // Set up Logged Data characteristic (for data download)
      try {
        this.loggedDataCharacteristic = await airqService.getCharacteristic(LOGGED_DATA_UUID);
        console.log('Logged data characteristic set up successfully');
      } catch (error) {
        console.error('Failed to get logged data characteristic:', error);
      }

      // Set up RTC Time characteristic (for time synchronization)
      try {
        this.rtcTimeCharacteristic = await airqService.getCharacteristic(RTC_TIME_UUID);
        console.log('RTC time characteristic set up successfully');
        
        // Automatically sync time when connected
        this.syncRTCTime();
      } catch (error) {
        console.error('Failed to get RTC time characteristic:', error);
      }

      // Set up chunk management characteristics
      try {
        console.log('Attempting to get chunk info characteristic...');
        this.chunkInfoCharacteristic = await airqService.getCharacteristic(CHUNK_INFO_UUID);
        console.log('✅ Chunk info characteristic set up successfully');
      } catch (error) {
        console.error('❌ Failed to get chunk info characteristic:', error);
        this.chunkInfoCharacteristic = null;
      }

      try {
        console.log('Attempting to get chunk request characteristic...');
        this.chunkRequestCharacteristic = await airqService.getCharacteristic(CHUNK_REQUEST_UUID);
        console.log('✅ Chunk request characteristic set up successfully');
      } catch (error) {
        console.error('❌ Failed to get chunk request characteristic:', error);
        this.chunkRequestCharacteristic = null;
      }

      console.log('Web Bluetooth notifications setup completed');
      return notificationsSetup;
    } catch (error) {
      console.error('Error setting up Web Bluetooth notifications:', error);
      // Don't throw - just log and continue
      console.log('Continuing with limited notification support...');
      return false;
    }
  }

  // Mobile BLE notifications setup
  async setupMobileNotifications() {
    try {
      console.log('Setting up mobile BLE notifications...');
      
      // Live Data notifications
      await this.device.monitorCharacteristicForService(
        AIRQ_SERVICE_UUID,
        LIVE_DATA_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('Live data notification error:', error);
            this.emit('error', 'Live data notification error: ' + error.message);
            return;
          }

          if (characteristic?.value) {
            const dataString = this.decodeBase64ToString(characteristic.value);
            console.log('Received AirQ data via notification:', dataString);
            
            // Parse comma-separated values: "pm1,pm25,pm10,battery"
            const values = dataString.split(',').map(val => parseFloat(val.trim()));
            
            if (values.length >= 4) {
              const pm25 = values[1] || 0;
              const calculatedAqi = this.calculateAQI(pm25);
              
              const eventData = {
                pm1: values[0] || 0,
                pm25: pm25,
                pm10: values[2] || 0,
                battery: values[3] || 0,
                aqi: calculatedAqi,
                error: null,
                timestamp: Date.now()
              };
              
              if (this.airQualityCallback) {
                this.airQualityCallback(eventData);
              }
              
              this.emit('airQualityUpdate', eventData);
            }
          }
        }
      );
      console.log('Live data notifications set up successfully');

      // Battery notifications
      await this.device.monitorCharacteristicForService(
        AIRQ_SERVICE_UUID,
        BATTERY_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('Battery notification error:', error);
            this.emit('error', 'Battery notification error: ' + error.message);
            return;
          }

          if (characteristic?.value) {
            const data = this.decodeBase64(characteristic.value);
            const batteryLevel = data[0];
            
            const eventData = {
              batteryLevel: batteryLevel,
              timestamp: Date.now()
            };
            
            if (this.batteryCallback) {
              this.batteryCallback(batteryLevel);
            }
            
            this.emit('batteryUpdate', eventData);
          }
        }
      );
      console.log('Battery notifications set up successfully');

      // Power Mode notifications
      await this.device.monitorCharacteristicForService(
        AIRQ_SERVICE_UUID,
        POWER_MODE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('Power mode notification error:', error);
            this.emit('error', 'Power mode notification error: ' + error.message);
            return;
          }

          if (characteristic?.value) {
            const modeString = this.decodeBase64ToString(characteristic.value);
            
            const eventData = {
              powerMode: modeString.trim(),
              timestamp: Date.now()
            };
            
            if (this.powerModeCallback) {
              this.powerModeCallback(modeString.trim());
            }
            
            this.emit('powerModeUpdate', eventData);
          }
        }
      );
      console.log('Power mode notifications set up successfully');

      console.log('All mobile BLE notifications set up successfully');
      return true;
    } catch (error) {
      console.error('Error setting up mobile BLE notifications:', error);
      throw error;
    }
  }

  // Helper methods for mobile BLE
  decodeBase64(base64String) {
    let binaryString = '';
    if (typeof atob === 'function') {
      binaryString = atob(base64String);
    } else if (typeof Buffer !== 'undefined') {
      binaryString = Buffer.from(base64String, 'base64').toString('binary');
    } else {
      throw new Error('Base64 decoding not supported');
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  decodeBase64ToString(base64String) {
    if (typeof atob === 'function') {
      return atob(base64String);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64String, 'base64').toString('utf-8');
    }
    throw new Error('Base64 decoding not supported');
  }

  encodeBase64(str) {
    if (typeof btoa === 'function') {
      return btoa(str);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'binary').toString('base64');
    }
    throw new Error('Base64 encoding not supported');
  }

  // Disconnect from device
  async disconnect() {
    try {
      this.stopPolling(); // This will work for both web and mobile polling
      
      if (this.device && this.isConnected) {
        if (this.isWeb) {
          if (this.server && this.server.connected) {
            this.server.disconnect();
          }
          console.log('Disconnected from Web Bluetooth device');
        } else {
          await this.device.cancelConnection();
          console.log('Disconnected from mobile BLE device');
        }
      }
        this.device = null;
      this.server = null;
      this.isConnected = false;
      
      if (this.connectionCallback) {
        this.connectionCallback(false);
      }
      
      this.emit('connectionChange', false);
    } catch (error) {
      console.error('Disconnect error:', error);
      this.emit('error', 'Disconnect error: ' + error.message);
    }
  }

  // Callback setters
  setAirQualityCallback(callback) {
    this.airQualityCallback = callback;
  }

  setBatteryCallback(callback) {
    this.batteryCallback = callback;
  }

  setPowerModeCallback(callback) {
    this.powerModeCallback = callback;
  }

  setConnectionCallback(callback) {
    this.connectionCallback = callback;
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

  // Getters
  getConnectionStatus() {
    return this.isConnected;
  }

  getDevice() {
    return this.device;
  }

  getPlatform() {
    return this.isWeb ? 'web' : 'mobile';
  }

  // Auto-connect support
  supportsAutoConnect() {
    // Web Bluetooth doesn't support silent auto-connect
    return !this.isWeb;
  }

  async autoConnect() {
    if (this.isWeb || !this.supportsAutoConnect()) {
      console.log('Auto-connect not supported on this platform');
      return false;
    }

    // Mobile auto-connect implementation would go here
    // For now, return false to require manual connection
    return false;
  }

  // Methods expected by App.js
  connect() {
    return new Promise(async (resolve, reject) => {
      try {
        const deviceFound = await new Promise((resolveDevice, rejectDevice) => {
          this.startScanning((device) => {
            resolveDevice(device);
          }).catch(rejectDevice);
        });

        const connected = await this.connectToDevice(deviceFound);
        if (connected) {
          this.storeDeviceInfo(deviceFound);
        }
        resolve(connected);
      } catch (error) {
        this.emit('error', error.message);
        reject(error);
      }
    });
  }

  quickConnect() {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.supportsAutoConnect()) {
          resolve(false);
          return;
        }

        this.emit('autoConnectAttempt', true);
        
        // For now, return false as auto-connect is not fully implemented
        this.emit('autoConnectAttempt', false);
        resolve(false);
      } catch (error) {
        this.emit('autoConnectAttempt', false);
        this.emit('error', error.message);
        reject(error);
      }
    });
  }

  getDeviceInfo() {
    return {
      name: this.device?.name || 'Unknown Device',
      connected: this.isConnected,
      services: ['Air Quality', 'Battery', 'Power Mode']
    };
  }

  forgetDevice() {
    this.clearStoredDeviceInfo();
  }

  // Write power mode to device
  async writePowerMode(lowPowerMode) {
    try {
      const value = lowPowerMode ? '1' : '0';
      
      if (this.isWeb) {
        if (this.powerModeCharacteristic && this.server && this.server.connected) {
          const encoder = new TextEncoder();
          const data = encoder.encode(value);
          await this.powerModeCharacteristic.writeValue(data);
          console.log('Power mode written to device (Web):', value);
          return true;
        } else {
          throw new Error('Power mode characteristic not available or device disconnected');
        }
      } else {
        if (this.device) {
          const base64Value = this.encodeBase64(value);
          await this.device.writeCharacteristicWithResponseForService(
            AIRQ_SERVICE_UUID,
            POWER_MODE_UUID,
            base64Value
          );
          console.log('Power mode written to device (Mobile):', value);
          return true;
        }
      }
      
      throw new Error('Power mode characteristic not available');
    } catch (error) {
      console.error('Failed to write power mode:', error);
      this.emit('error', 'Failed to write power mode: ' + error.message);
      return false;
    }
  }

  // Read current power mode from device
  async readPowerMode() {
    try {
      if (this.isWeb) {
        if (this.powerModeCharacteristic && this.server && this.server.connected) {
          const value = await this.powerModeCharacteristic.readValue();
          const modeString = new TextDecoder().decode(value);
          return modeString.trim();
        }
      } else {
        if (this.device) {
          const characteristic = await this.device.readCharacteristicForService(
            AIRQ_SERVICE_UUID,
            POWER_MODE_UUID
          );
          if (characteristic && characteristic.value) {
            return this.decodeBase64ToString(characteristic.value).trim();
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to read power mode:', error);
      return null;
    }
  }

  // RTC Time Synchronization
  async syncRTCTime() {
    try {
      console.log('Syncing RTC time with device...');
      
      // Get current time as Unix timestamp
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (this.isWeb) {
        return this.syncRTCTimeWeb(currentTime);
      } else {
        return this.syncRTCTimeMobile(currentTime);
      }
    } catch (error) {
      console.error('Failed to sync RTC time:', error);
      this.emit('error', 'Failed to sync RTC time: ' + error.message);
      throw error;
    }
  }

  // Web Bluetooth RTC time sync
  async syncRTCTimeWeb(timestamp) {
    if (!this.rtcTimeCharacteristic || !this.server || !this.server.connected) {
      throw new Error('Device not connected or RTC time characteristic not available');
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(timestamp.toString());
      await this.rtcTimeCharacteristic.writeValue(data);
      console.log('RTC time synced successfully (Web):', new Date(timestamp * 1000));
      return true;
    } catch (error) {
      console.error('Web Bluetooth RTC time sync error:', error);
      throw error;
    }
  }

  // Mobile BLE RTC time sync
  async syncRTCTimeMobile(timestamp) {
    if (!this.device) {
      throw new Error('Device not connected');
    }

    try {
      const base64Value = this.encodeBase64(timestamp.toString());
      await this.device.writeCharacteristicWithResponseForService(
        AIRQ_SERVICE_UUID,
        RTC_TIME_UUID,
        base64Value
      );
      console.log('RTC time synced successfully (Mobile):', new Date(timestamp * 1000));
      return true;
    } catch (error) {
      console.error('Mobile BLE RTC time sync error:', error);
      throw error;
    }
  }

  // Read current RTC time from device
  async readRTCTime() {
    try {
      if (this.isWeb) {
        return this.readRTCTimeWeb();
      } else {
        return this.readRTCTimeMobile();
      }
    } catch (error) {
      console.error('Failed to read RTC time:', error);
      return null;
    }
  }

  // Web Bluetooth RTC time read
  async readRTCTimeWeb() {
    if (!this.rtcTimeCharacteristic || !this.server || !this.server.connected) {
      throw new Error('Device not connected or RTC time characteristic not available');
    }

    try {
      const value = await this.rtcTimeCharacteristic.readValue();
      const timeString = new TextDecoder().decode(value);
      const timestamp = parseInt(timeString);
      console.log('RTC time read (Web):', new Date(timestamp * 1000));
      return timestamp;
    } catch (error) {
      console.error('Web Bluetooth RTC time read error:', error);
      throw error;
    }
  }

  // Mobile BLE RTC time read
  async readRTCTimeMobile() {
    if (!this.device) {
      throw new Error('Device not connected');
    }

    try {
      const characteristic = await this.device.readCharacteristicForService(
        AIRQ_SERVICE_UUID,
        RTC_TIME_UUID
      );
      
      if (characteristic?.value) {
        const timeString = this.decodeBase64ToString(characteristic.value);
        const timestamp = parseInt(timeString);
        console.log('RTC time read (Mobile):', new Date(timestamp * 1000));
        return timestamp;
      } else {
        throw new Error('No RTC time received from device');
      }
    } catch (error) {
      console.error('Mobile BLE RTC time read error:', error);
      throw error;
    }
  }

  // Fallback polling mechanism for when notifications don't work
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = setInterval(async () => {
      if (!this.isConnected || !this.server || !this.server.connected) {
        return;
      }
      
      try {
        if (this.liveDataCharacteristic) {
          const value = await this.liveDataCharacteristic.readValue();
          const dataString = new TextDecoder().decode(value);
          console.log('Polled AirQ data:', dataString);
          
          const values = dataString.split(',').map(val => parseFloat(val.trim()));
          
          if (values.length >= 4) {
            const pm25 = values[1] || 0;
            const calculatedAqi = this.calculateAQI(pm25);
            
            const eventData = {
              pm1: values[0] || 0,
              pm25: pm25,
              pm10: values[2] || 0,
              battery: values[3] || 0,
              aqi: calculatedAqi,
              error: null,
              timestamp: Date.now()
            };
            
            if (this.airQualityCallback) {
              this.airQualityCallback(eventData);
            }
            
            this.emit('airQualityUpdate', eventData);
          }
        }
      } catch (error) {
        console.error('Polling failed:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Mobile BLE polling fallback (only used if notifications fail)
  startMobilePolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = setInterval(async () => {
      if (!this.isConnected || !this.device) {
        return;
      }
      
      try {
        // Read live data characteristic
        const characteristic = await this.device.readCharacteristicForService(
          AIRQ_SERVICE_UUID,
          LIVE_DATA_UUID
        );
        
        if (characteristic?.value) {
          const dataString = this.decodeBase64ToString(characteristic.value);
          console.log('Polled AirQ data (mobile):', dataString);
          
          const values = dataString.split(',').map(val => parseFloat(val.trim()));
          
          if (values.length >= 4) {
            const pm25 = values[1] || 0;
            const calculatedAqi = this.calculateAQI(pm25);
            
            const eventData = {
              pm1: values[0] || 0,
              pm25: pm25,
              pm10: values[2] || 0,
              battery: values[3] || 0,
              aqi: calculatedAqi,
              error: null,
              timestamp: Date.now()
            };
            
            if (this.airQualityCallback) {
              this.airQualityCallback(eventData);
            }
            
            this.emit('airQualityUpdate', eventData);
          }
        }
      } catch (error) {
        console.error('Mobile polling failed:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  // Calculate AQI from PM2.5 values using US EPA standard
  calculateAQI(pm25) {
    if (pm25 < 0 || isNaN(pm25)) {
      return 0;
    }

    // US EPA PM2.5 AQI breakpoints
    const breakpoints = [
      { aqi: [0, 50], pm25: [0, 12.0] },
      { aqi: [51, 100], pm25: [12.1, 35.4] },
      { aqi: [101, 150], pm25: [35.5, 55.4] },
      { aqi: [151, 200], pm25: [55.5, 150.4] },
      { aqi: [201, 300], pm25: [150.5, 250.4] },
      { aqi: [301, 500], pm25: [250.5, 500.4] }
    ];

    for (const bp of breakpoints) {
      if (pm25 >= bp.pm25[0] && pm25 <= bp.pm25[1]) {
        // Linear interpolation formula
        const aqi = ((bp.aqi[1] - bp.aqi[0]) / (bp.pm25[1] - bp.pm25[0])) * (pm25 - bp.pm25[0]) + bp.aqi[0];
        return Math.round(aqi);
      }
    }

    // If PM2.5 is above all breakpoints, return max AQI
    return 500;
  }

  // Download logged data from Arduino flash storage
  async downloadLoggedData() {
    try {
      console.log('Downloading logged data from device using chunked transfer...');

      if (this.isWeb) {
        return this.downloadLoggedDataWeb();
      } else {
        return this.downloadLoggedDataMobile();
      }
    } catch (error) {
      console.error('Failed to download logged data:', error);
      this.emit('error', 'Failed to download logged data: ' + error.message);
      throw error;
    }
  }

  // Web Bluetooth logged data download with chunking
  async downloadLoggedDataWeb() {
    if (!this.loggedDataCharacteristic || !this.server || !this.server.connected) {
      throw new Error('Device not connected or logged data characteristic not available');
    }

    console.log('=== CHUNKED DOWNLOAD DEBUG ===');
    console.log('Chunk info characteristic:', this.chunkInfoCharacteristic ? 'Available' : 'NOT AVAILABLE');
    console.log('Chunk request characteristic:', this.chunkRequestCharacteristic ? 'Available' : 'NOT AVAILABLE');

    if (!this.chunkInfoCharacteristic || !this.chunkRequestCharacteristic) {
      console.warn('Chunk characteristics not available, falling back to single read');
      console.log('=== FALLING BACK TO LEGACY ===');
      return this.downloadLoggedDataWebLegacy();
    }

    try {
      console.log('=== STARTING CHUNKED TRANSFER (STREAM MODE) ===');
      // Step 1: Request data preparation (send -1 to chunk request)
      console.log('Step 1: Requesting data preparation...');
      this.emit('downloadProgress', { stage: 'preparing', progress: 0, message: 'Preparing data for download...' });

      const encoder = new TextEncoder();
      await this.chunkRequestCharacteristic.writeValue(encoder.encode('-1'));
      console.log('Data preparation request sent');

      // Small delay to let Arduino prepare the data
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Get chunk info (totalChunks)
      console.log('Step 2: Reading chunk info...');
      this.emit('downloadProgress', { stage: 'info', progress: 5, message: 'Getting chunk information...' });

      const chunkInfoValue = await this.chunkInfoCharacteristic.readValue();
      const chunkInfoString = new TextDecoder().decode(chunkInfoValue);
      console.log('Raw chunk info received:', chunkInfoString);
      const [totalChunks] = chunkInfoString.split(',').map(s => parseInt(s.trim()));

      console.log(`Data prepared for chunked transfer: ${totalChunks} chunks`);

      if (totalChunks <= 0) {
        console.log('No data available on device');
        this.emit('downloadProgress', { stage: 'complete', progress: 100, message: 'No data available on device' });
        return [];
      }

      await this.loggedDataCharacteristic.startNotifications();

      // Helper to wait for next notification
      const waitForNotification = () => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.loggedDataCharacteristic.removeEventListener('characteristicvaluechanged', handler);
            reject(new Error('Notification timeout'));
          }, 2000);
          const handler = (event) => {
            clearTimeout(timeoutId);
            this.loggedDataCharacteristic.removeEventListener('characteristicvaluechanged', handler);
            const value = event.target.value;
            const data = new TextDecoder().decode(value);
            resolve(data);
          };
          this.loggedDataCharacteristic.addEventListener('characteristicvaluechanged', handler);
        });
      };

      // Step 3: Download all chunks using notifications
      let completeDataString = '';
      let chunkIndex = 0;

      while (chunkIndex < totalChunks) {
        const chunkProgress = Math.round(((chunkIndex / totalChunks) * 90) + 10);
        this.emit('downloadProgress', {
          stage: 'downloading',
          progress: chunkProgress,
          message: `Downloading chunk ${chunkIndex + 1} of ${totalChunks}...`,
          currentChunk: chunkIndex + 1,
          totalChunks: totalChunks
        });

        await this.chunkRequestCharacteristic.writeValue(encoder.encode(chunkIndex.toString()));

        try {
          const chunkData = await waitForNotification();
          console.log(`Received chunk ${chunkIndex}: ${chunkData.length} characters`);
          completeDataString += chunkData;
          chunkIndex++;
        } catch (err) {
          console.warn(`Chunk ${chunkIndex} timeout, retrying...`);
        }
      }

      await this.loggedDataCharacteristic.stopNotifications();

      console.log(`=== CHUNKED TRANSFER COMPLETE ===`);
      console.log(`Complete data assembled: ${completeDataString.length} characters`);
      console.log(`First 200 chars: "${completeDataString.substring(0, 200)}${completeDataString.length > 200 ? '...' : ''}"`);
      
      this.emit('downloadProgress', { stage: 'parsing', progress: 95, message: 'Parsing downloaded data...' });
      const parsedData = this.parseLoggedData(completeDataString);
      
      this.emit('downloadProgress', { 
        stage: 'complete', 
        progress: 100, 
        message: `Download complete! Received ${parsedData.length} entries`,
        totalEntries: parsedData.length
      });
      
      console.log(`Chunked transfer completed successfully. Received ${parsedData.length} entries`);
      return parsedData;
      
    } catch (error) {
      console.error('Chunked download failed, trying legacy method:', error);
      this.emit('downloadProgress', { stage: 'error', progress: 0, message: 'Chunked download failed, trying legacy method...' });
      return this.downloadLoggedDataWebLegacy();
    }
  }

  // Fallback for devices without chunking support
  async downloadLoggedDataWebLegacy() {
    try {
      console.log('=== LEGACY DOWNLOAD DEBUG ===');
      this.emit('downloadProgress', { stage: 'downloading', progress: 50, message: 'Downloading data (legacy mode)...' });
      
      const value = await this.loggedDataCharacteristic.readValue();
      const dataString = new TextDecoder().decode(value);
      console.log(`Legacy: Raw logged data received: ${dataString.length} characters`);
      console.log(`Legacy: Data content: "${dataString.substring(0, 200)}${dataString.length > 200 ? '...' : ''}"`);
      
      this.emit('downloadProgress', { stage: 'parsing', progress: 90, message: 'Parsing downloaded data...' });
      const parsedData = this.parseLoggedData(dataString);
      
      this.emit('downloadProgress', { 
        stage: 'complete', 
        progress: 100, 
        message: `Download complete! Received ${parsedData.length} entries`,
        totalEntries: parsedData.length
      });
      
      console.log(`Legacy: Parsed ${parsedData.length} entries`);
      return parsedData;
    } catch (error) {
      console.error('Legacy Web Bluetooth logged data read error:', error);
      throw error;
    }
  }

  // Mobile BLE logged data download with chunking
  async downloadLoggedDataMobile() {
    if (!this.device) {
      throw new Error('Device not connected');
    }

    try {
      // Check if chunk characteristics are available
      let hasChunkSupport = true;
      try {
        await this.device.readCharacteristicForService(AIRQ_SERVICE_UUID, CHUNK_INFO_UUID);
      } catch (error) {
        console.warn('Chunk characteristics not available, falling back to single read');
        hasChunkSupport = false;
      }

      if (!hasChunkSupport) {
        return this.downloadLoggedDataMobileLegacy();
      }

      // Step 1: Request data preparation (send -1 to chunk request)
      console.log('Requesting data preparation...');
      this.emit('downloadProgress', { stage: 'preparing', progress: 0, message: 'Preparing data for download...' });
      
      const prepareValue = this.encodeBase64('-1');
      await this.device.writeCharacteristicWithResponseForService(
        AIRQ_SERVICE_UUID,
        CHUNK_REQUEST_UUID,
        prepareValue
      );
      
      // Small delay to let Arduino prepare the data
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Get chunk info
      this.emit('downloadProgress', { stage: 'info', progress: 5, message: 'Getting chunk information...' });
      
      const chunkInfoChar = await this.device.readCharacteristicForService(
        AIRQ_SERVICE_UUID,
        CHUNK_INFO_UUID
      );
      
      const chunkInfoString = this.decodeBase64ToString(chunkInfoChar.value);
      const [totalChunks, currentChunk] = chunkInfoString.split(',').map(s => parseInt(s.trim()));
      
      console.log(`Data prepared for chunked transfer: ${totalChunks} chunks`);

      if (totalChunks <= 0) {
        console.log('No data available on device');
        this.emit('downloadProgress', { stage: 'complete', progress: 100, message: 'No data available on device' });
        return [];
      }

      // Step 3: Download all chunks
      let completeDataString = '';
      
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        console.log(`Requesting chunk ${chunkIndex}/${totalChunks - 1}...`);
        
        const chunkProgress = Math.round(((chunkIndex / totalChunks) * 90) + 10); // 10-100% range
        this.emit('downloadProgress', { 
          stage: 'downloading', 
          progress: chunkProgress, 
          message: `Downloading chunk ${chunkIndex + 1} of ${totalChunks}...`,
          currentChunk: chunkIndex + 1,
          totalChunks: totalChunks
        });
        
        // Request specific chunk
        const chunkRequestValue = this.encodeBase64(chunkIndex.toString());
        await this.device.writeCharacteristicWithResponseForService(
          AIRQ_SERVICE_UUID,
          CHUNK_REQUEST_UUID,
          chunkRequestValue
        );
        
        // Small delay between chunk requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Read the chunk data
        const chunkChar = await this.device.readCharacteristicForService(
          AIRQ_SERVICE_UUID,
          LOGGED_DATA_UUID
        );
        
        if (chunkChar?.value) {
          const chunkData = this.decodeBase64ToString(chunkChar.value);
          console.log(`Received chunk ${chunkIndex}: ${chunkData.length} characters`);
          completeDataString += chunkData;
        }
      }

      console.log(`Complete data assembled: ${completeDataString.length} characters`);
      this.emit('downloadProgress', { stage: 'parsing', progress: 95, message: 'Parsing downloaded data...' });
      
      const parsedData = this.parseLoggedData(completeDataString);
      
      this.emit('downloadProgress', { 
        stage: 'complete', 
        progress: 100, 
        message: `Download complete! Received ${parsedData.length} entries`,
        totalEntries: parsedData.length
      });
      
      console.log(`Chunked transfer completed successfully. Received ${parsedData.length} entries`);
      return parsedData;
      
    } catch (error) {
      console.error('Chunked download failed, trying legacy method:', error);
      this.emit('downloadProgress', { stage: 'error', progress: 0, message: 'Chunked download failed, trying legacy method...' });
      return this.downloadLoggedDataMobileLegacy();
    }
  }

  // Fallback for devices without chunking support  
  async downloadLoggedDataMobileLegacy() {
    try {
      this.emit('downloadProgress', { stage: 'downloading', progress: 50, message: 'Downloading data (legacy mode)...' });
      
      const characteristic = await this.device.readCharacteristicForService(
        AIRQ_SERVICE_UUID,
        LOGGED_DATA_UUID
      );
      
      if (characteristic?.value) {
        const dataString = this.decodeBase64ToString(characteristic.value);
        console.log('Raw logged data received (Legacy Mobile):', dataString);
        
        this.emit('downloadProgress', { stage: 'parsing', progress: 90, message: 'Parsing downloaded data...' });
        const parsedData = this.parseLoggedData(dataString);
        
        this.emit('downloadProgress', { 
          stage: 'complete', 
          progress: 100, 
          message: `Download complete! Received ${parsedData.length} entries`,
          totalEntries: parsedData.length
        });
        
        return parsedData;
      } else {
        throw new Error('No logged data received from device');
      }
    } catch (error) {
      console.error('Legacy Mobile BLE logged data read error:', error);
      throw error;
    }
  }

  // Parse logged data string into structured array
  parseLoggedData(dataString) {
    if (!dataString || dataString.trim() === '') {
      return [];
    }

    // Data format: "timestamp,pm1,pm25,pm10,battery;"
    // Multiple entries separated by semicolons
    const entries = dataString.split(';').filter(entry => entry.trim() !== '');
    
    const parsedData = entries.map(entry => {
      const values = entry.split(',').map(val => val.trim());
      
      if (values.length >= 5) {
        const timestamp = parseInt(values[0]) || 0;
        const pm1 = parseFloat(values[1]) || 0;
        const pm25 = parseFloat(values[2]) || 0;
        const pm10 = parseFloat(values[3]) || 0;
        const battery = parseFloat(values[4]) || 0;
        const aqi = this.calculateAQI(pm25);
        
        // Handle both Unix timestamps (from RTC) and millis timestamps (legacy)
        let date;
        if (timestamp > 1609459200) { // After Jan 1, 2021 - likely Unix timestamp
          date = new Date(timestamp * 1000);
        } else {
          // Legacy millis timestamp or invalid - use relative time
          date = new Date(Date.now() - (timestamp / 1000));
        }
        
        return {
          timestamp: timestamp,
          date: date,
          pm1: pm1,
          pm25: pm25,
          pm10: pm10,
          battery: battery,
          aqi: aqi
        };
      }
      return null;
    }).filter(entry => entry !== null);

    console.log(`Parsed ${parsedData.length} logged data entries`);
    return parsedData;
  }

  // Convert logged data to CSV format for download
  loggedDataToCSV(loggedData) {
    if (!loggedData || loggedData.length === 0) {
      return '';
    }

    const headers = ['Timestamp', 'Date', 'PM1.0 (μg/m³)', 'PM2.5 (μg/m³)', 'PM10 (μg/m³)', 'Battery (%)', 'AQI'];
    const csvRows = [headers.join(',')];

    loggedData.forEach(entry => {
      const row = [
        entry.timestamp,
        entry.date.toISOString(),
        entry.pm1,
        entry.pm25,
        entry.pm10,
        entry.battery,
        entry.aqi
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Download logged data as a CSV file (web only)
  downloadLoggedDataAsFile(loggedData, filename = 'airq_logged_data.csv') {
    if (!this.isWeb) {
      console.warn('File download only available on web platform');
      return false;
    }

    try {
      const csvContent = this.loggedDataToCSV(loggedData);
      
      if (!csvContent) {
        throw new Error('No data to download');
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to download file:', error);
      return false;
    }
  }

  // Get chunked transfer statistics (for debugging)
  getChunkTransferStats() {
    return {
      platform: this.isWeb ? 'web' : 'mobile',
      hasChunkSupport: Boolean(this.chunkInfoCharacteristic && this.chunkRequestCharacteristic),
      chunkInfoAvailable: Boolean(this.chunkInfoCharacteristic),
      chunkRequestAvailable: Boolean(this.chunkRequestCharacteristic),
      loggedDataAvailable: Boolean(this.loggedDataCharacteristic)
    };
  }

  // Debug function to list all available characteristics
  async debugListCharacteristics() {
    if (!this.isWeb || !this.server || !this.server.connected) {
      console.log('Cannot list characteristics - not connected via Web Bluetooth');
      return;
    }

    try {
      console.log('=== LISTING ALL CHARACTERISTICS ===');
      const airqService = await this.server.getPrimaryService(AIRQ_SERVICE_UUID);
      
      // Try to get all known characteristics
      const knownCharacteristics = [
        { name: 'Live Data', uuid: LIVE_DATA_UUID },
        { name: 'Logged Data', uuid: LOGGED_DATA_UUID },
        { name: 'Battery', uuid: BATTERY_UUID },
        { name: 'Power Mode', uuid: POWER_MODE_UUID },
        { name: 'RTC Time', uuid: RTC_TIME_UUID },
        { name: 'Chunk Info', uuid: CHUNK_INFO_UUID },
        { name: 'Chunk Request', uuid: CHUNK_REQUEST_UUID }
      ];

      for (const char of knownCharacteristics) {
        try {
          const characteristic = await airqService.getCharacteristic(char.uuid);
          console.log(`✅ ${char.name}: Found (${char.uuid})`);
        } catch (error) {
          console.log(`❌ ${char.name}: NOT FOUND (${char.uuid}) - ${error.message}`);
        }
      }
      console.log('=== END CHARACTERISTIC LIST ===');
    } catch (error) {
      console.error('Failed to list characteristics:', error);
    }
  }
}

export default new PlatformBluetoothService();
