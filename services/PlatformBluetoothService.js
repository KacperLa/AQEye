// Platform-aware Bluetooth Service for Expo React Native
// Supports both mobile (react-native-ble-plx) and web (Web Bluetooth API)

import { Platform } from 'react-native';

// BLE Service and Characteristic UUIDs (matching AirQ Arduino code)
const AIRQ_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const LIVE_DATA_UUID = '12345678-1234-1234-1234-123456789abd';
const LOGGED_DATA_UUID = '12345678-1234-1234-1234-123456789abe';
const BATTERY_UUID = '12345678-1234-1234-1234-123456789abf';
const POWER_MODE_UUID = '12345678-1234-1234-1234-123456789ac0';

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
      autoConnectAttempt: []
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
        await this.setupWebNotifications();
      } catch (error) {
        console.error('Notification setup failed, but continuing with connection:', error);
        // Connection is still valid even if notifications fail
      }
      
      // Start polling as fallback if notifications don't work properly
      console.log('Starting polling as fallback mechanism...');
      this.startPolling();
      
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
      console.log('Mobile BLE services discovered');      this.isConnected = true;
      
      // Set up notifications
      await this.setupMobileNotifications();
      
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
    try {
      console.log('Setting up Web Bluetooth notifications...');
      
      // Check if server is still connected
      if (!this.server || !this.server.connected) {
        console.error('GATT server is not connected');
        return;
      }
      
      // Get AirQ Service with better error handling
      let airqService;
      try {
        airqService = await this.server.getPrimaryService(AIRQ_SERVICE_UUID);
        console.log('AirQ service found');
      } catch (error) {
        console.error('Failed to get AirQ service:', error);
        console.log('Available services might be limited. Trying to continue...');
        return;
      }
      
      // Set up Live Data characteristic (most important)
      try {
        this.liveDataCharacteristic = await airqService.getCharacteristic(LIVE_DATA_UUID);
        
        // Try to start notifications
        try {
          await this.liveDataCharacteristic.startNotifications();
          console.log('Live data notifications started successfully');
          
          this.liveDataCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = event.target.value;
            const dataString = new TextDecoder().decode(value);
            console.log('Received AirQ data:', dataString);
            
            // Parse comma-separated values: "pm1,pm25,pm10,battery"
            const values = dataString.split(',').map(val => parseFloat(val.trim()));
            
            if (values.length >= 4) {
              const eventData = {
                pm1: values[0] || 0,
                pm25: values[1] || 0,
                pm10: values[2] || 0,
                battery: values[3] || 0,
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

      console.log('Web Bluetooth notifications setup completed (with some potential limitations)');
    } catch (error) {
      console.error('Error setting up Web Bluetooth notifications:', error);
      // Don't throw - just log and continue
      console.log('Continuing with limited notification support...');
    }
  }

  // Mobile BLE notifications setup
  async setupMobileNotifications() {
    try {
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
            console.log('Received AirQ data:', dataString);
            
            // Parse comma-separated values: "pm1,pm25,pm10,battery"
            const values = dataString.split(',').map(val => parseFloat(val.trim()));
            
            if (values.length >= 4) {
              const eventData = {
                pm1: values[0] || 0,
                pm25: values[1] || 0,
                pm10: values[2] || 0,
                battery: values[3] || 0,
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

      console.log('Mobile BLE notifications set up successfully');
    } catch (error) {
      console.error('Error setting up mobile BLE notifications:', error);
      throw error;
    }
  }

  // Helper methods for mobile BLE
  decodeBase64(base64String) {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  decodeBase64ToString(base64String) {
    return atob(base64String);
  }

  // Disconnect from device
  async disconnect() {
    try {
      this.stopPolling();
      
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
          const base64Value = btoa(value);
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
            const eventData = {
              pm1: values[0] || 0,
              pm25: values[1] || 0,
              pm10: values[2] || 0,
              battery: values[3] || 0,
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
}

export default new PlatformBluetoothService();
