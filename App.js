import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
  StatusBar,
  SafeAreaView,
  TouchableOpacity
} from 'react-native';
import * as Device from 'expo-device';
import BluetoothService from './services/PlatformBluetoothService';
import MetricCard from './components/MetricCard';
import DataChart from './components/DataChart';
import ConnectionSection from './components/ConnectionSection';
import AirQualityDisplay from './components/AirQualityDisplay';
import GraphModal from './components/GraphModal';
import LoggedDataModal from './components/LoggedDataModal';

const { width, height } = Dimensions.get('window');

export default function App() {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(false);
  const [error, setError] = useState(null);

  // Sensor data state
  const [airQualityData, setAirQualityData] = useState({
    pm1: 0,
    pm25: 0,
    pm10: 0,
    aqi: 0,
    error: null
  });
  const [battery, setBattery] = useState(0);
  const [powerMode, setPowerMode] = useState('Unknown');
  const [updateCount, setUpdateCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState({
    airQuality: null,
    battery: null,
    powerMode: null
  });

  // Historical data for charts
  const [pm1History, setPm1History] = useState([]);
  const [pm25History, setPm25History] = useState([]);
  const [pm10History, setPm10History] = useState([]);
  const [aqiHistory, setAqiHistory] = useState([]);
  const [batteryHistory, setBatteryHistory] = useState([]);

  // Device info state
  const [deviceInfo, setDeviceInfo] = useState({
    name: null,
    connected: false,
    services: []
  });

  // Graph modal state
  const [graphModalVisible, setGraphModalVisible] = useState(false);
  const [selectedGraphData, setSelectedGraphData] = useState({
    type: '',
    title: '',
    data: [],
    unit: ''
  });

  // Logged data modal state
  const [loggedDataModalVisible, setLoggedDataModalVisible] = useState(false);

  // Real-time update display state
  const [currentTime, setCurrentTime] = useState(Date.now());

  // References
  const bluetoothService = useRef(null);

  // Initialize Bluetooth service
  useEffect(() => {
    bluetoothService.current = BluetoothService;
    
    // Check if device remembering is enabled
    setAutoConnectEnabled(bluetoothService.current.isRememberDeviceEnabled());

    // Set up event listeners
    bluetoothService.current.addEventListener('connectionChange', async (connected) => {
      setIsConnected(connected);
      setIsConnecting(false);
      setIsAutoConnecting(false);
      if (!connected) {
        setError(null);
        setDeviceInfo(prev => ({ ...prev, connected: false }));
      } else {
        // Read initial power mode when connected
        try {
          const currentPowerMode = await bluetoothService.current.readPowerMode();
          if (currentPowerMode) {
            setPowerMode(currentPowerMode);
          }
        } catch (error) {
          console.log('Could not read initial power mode:', error);
        }
      }
    });

    bluetoothService.current.addEventListener('airQualityUpdate', (data) => {
      setAirQualityData({
        pm1: data.pm1,
        pm25: data.pm25,
        pm10: data.pm10,
        aqi: data.aqi,
        error: data.error
      });
      setLastUpdate(prev => ({ ...prev, airQuality: data.timestamp }));
      setUpdateCount(prev => prev + 1);
      
      // Handle battery data if present
      if (data.battery !== undefined && data.battery !== null) {
        setBattery(data.battery);
        setLastUpdate(prev => ({ ...prev, battery: data.timestamp }));
        
        // Add to battery history
        setBatteryHistory(prev => {
          const newHistory = [...prev, {
            time: new Date(data.timestamp).toLocaleTimeString(),
            value: data.battery,
            timestamp: data.timestamp,
            status: getBatteryStatus(data.battery)
          }];
          return newHistory.slice(-50);
        });
      }
      
      // Add to PM1.0 history (keep last 50 readings)
      setPm1History(prev => {
        const newHistory = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          value: data.pm1,
          timestamp: data.timestamp,
          status: getPM25Status(data.pm1) // Using PM2.5 status logic for PM1.0
        }];
        return newHistory.slice(-50);
      });

      // Add to PM2.5 history (keep last 50 readings)
      setPm25History(prev => {
        const newHistory = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          value: data.pm25,
          timestamp: data.timestamp,
          status: getPM25Status(data.pm25)
        }];
        return newHistory.slice(-50);
      });

      // Add to PM10 history (keep last 50 readings)
      setPm10History(prev => {
        const newHistory = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          value: data.pm10,
          timestamp: data.timestamp,
          status: getPM10Status(data.pm10)
        }];
        return newHistory.slice(-50);
      });

      // Add to AQI history (keep last 50 readings)
      setAqiHistory(prev => {
        const newHistory = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          value: data.aqi,
          timestamp: data.timestamp,
          status: getAQIStatus(data.aqi)
        }];
        return newHistory.slice(-50);
      });
    });

    bluetoothService.current.addEventListener('batteryUpdate', (data) => {
      setBattery(data.batteryLevel);
      setLastUpdate(prev => ({ ...prev, battery: data.timestamp }));
      
      // Add to history (keep last 50 readings)
      setBatteryHistory(prev => {
        const newHistory = [...prev, {
          time: new Date(data.timestamp).toLocaleTimeString(),
          value: data.batteryLevel,
          timestamp: data.timestamp,
          status: getBatteryStatus(data.batteryLevel)
        }];
        return newHistory.slice(-50);
      });
    });

    bluetoothService.current.addEventListener('powerModeUpdate', (data) => {
      setPowerMode(data.powerMode);
      setLastUpdate(prev => ({ ...prev, powerMode: data.timestamp }));
    });

    bluetoothService.current.addEventListener('error', (errorMsg) => {
      setError(errorMsg);
      setIsConnecting(false);
      setIsAutoConnecting(false);
    });

    bluetoothService.current.addEventListener('autoConnectAttempt', (attempting) => {
      setIsAutoConnecting(attempting);
    });

    // Try auto-connect if enabled
    if (bluetoothService.current.isRememberDeviceEnabled()) {
      handleAutoConnect();
    }

    return () => {
      if (bluetoothService.current) {
        bluetoothService.current.disconnect();
      }
    };
  }, []);

  // Update current time every second for real-time "time since last update" display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-connect function
  const handleAutoConnect = async () => {
    if (!bluetoothService.current) return;
    
    try {
      setIsAutoConnecting(true);
      const success = await bluetoothService.current.quickConnect();
      if (success) {
        const info = await bluetoothService.current.getDeviceInfo();
        setDeviceInfo(info);
      }
    } catch (error) {
      console.error('Auto-connect failed:', error);
    } finally {
      setIsAutoConnecting(false);
    }
  };

  // Connect to device
  const handleConnect = async () => {
    if (!bluetoothService.current) return;

    try {
      setIsConnecting(true);
      setError(null);
      
      const success = await bluetoothService.current.connect();
      if (success) {
        const info = await bluetoothService.current.getDeviceInfo();
        setDeviceInfo(info);
        
        // Automatically sync RTC time when connected
        try {
          await bluetoothService.current.syncRTCTime();
          console.log('RTC time automatically synced on connection');
        } catch (error) {
          console.warn('Failed to auto-sync RTC time:', error);
        }
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from device
  const handleDisconnect = async () => {
    if (bluetoothService.current) {
      await bluetoothService.current.disconnect();
      setDeviceInfo({
        name: null,
        connected: false,
        services: []
      });
    }
  };

  // Forget device
  const handleForgetDevice = async () => {
    Alert.alert(
      'Forget Device',
      'Are you sure you want to forget this device? You will need to pair again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            if (bluetoothService.current) {
              bluetoothService.current.forgetDevice();
              setAutoConnectEnabled(false);
              handleDisconnect();
            }
          }
        }
      ]
    );
  };

  // Toggle auto-connect
  const handleToggleAutoConnect = (enabled) => {
    setAutoConnectEnabled(enabled);
    if (bluetoothService.current) {
      bluetoothService.current.setRememberDevice(enabled);
    }
  };

  // Handle power mode change
  const handlePowerModeChange = async (lowPowerMode) => {
    try {
      const success = await bluetoothService.current.writePowerMode(lowPowerMode);
      if (success) {
        // Update local state immediately for better UX
        setPowerMode(lowPowerMode ? '1' : '0');
        
        // Show feedback
        Alert.alert(
          'Power Mode Changed',
          `Power mode set to ${lowPowerMode ? 'Low Power (Deep Sleep)' : 'Responsive (Light Sleep)'}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to change power mode: ' + error.message);
    }
  };

  // Handle viewing graph for a specific metric
  const handleViewGraph = (type, title) => {
    let data = [];
    let unit = '';

    switch (type) {
      case 'pm1':
        data = pm1History;
        unit = 'μg/m³';
        break;
      case 'pm25':
        data = pm25History;
        unit = 'μg/m³';
        break;
      case 'pm10':
        data = pm10History;
        unit = 'μg/m³';
        break;
      case 'aqi':
        data = aqiHistory;
        unit = '';
        break;
      case 'battery':
        data = batteryHistory;
        unit = '%';
        break;
      default:
        data = [];
        unit = '';
    }

    setSelectedGraphData({
      type,
      title,
      data,
      unit
    });
    setGraphModalVisible(true);
  };

  const handleCloseGraph = () => {
    setGraphModalVisible(false);
  };

  // Handle RTC time synchronization
  const handleSyncTime = async () => {
    try {
      const success = await bluetoothService.current.syncRTCTime();
      if (success) {
        Alert.alert(
          'Time Sync Successful',
          'Device clock has been synchronized with your phone/computer time.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Time Sync Failed', 'Failed to synchronize device time. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync time: ' + error.message);
    }
  };

  // Helper function to format time since last update
  const formatTimeSinceUpdate = (lastUpdateTimestamp) => {
    if (!lastUpdateTimestamp) return 'Never';
    
    const diffMs = currentTime - lastUpdateTimestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 1) return '0s ago';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    return `${Math.floor(diffSecs / 3600)}h ago`;
  };

  // Helper functions for air quality status determination
  const getPM25Status = (pm25) => {
    if (!pm25 || pm25 === 0 || isNaN(pm25)) return 'invalid';
    if (pm25 <= 12) return 'normal';
    if (pm25 <= 35) return 'warning';
    return 'critical';
  };

  const getPM10Status = (pm10) => {
    if (!pm10 || pm10 === 0 || isNaN(pm10)) return 'invalid';
    if (pm10 <= 54) return 'normal';
    if (pm10 <= 154) return 'warning';
    return 'critical';
  };

  const getAQIStatus = (aqi) => {
    if (!aqi || aqi === 0 || isNaN(aqi)) return 'invalid';
    if (aqi <= 50) return 'normal';
    if (aqi <= 100) return 'warning';
    return 'critical';
  };

  const getBatteryStatus = (battery) => {
    if (!battery || battery === 0 || isNaN(battery)) return 'invalid';
    if (battery < 20) return 'critical';
    if (battery < 50) return 'warning';
    return 'normal';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.stickyHeaderContent}>
          <Text style={styles.appTitle}>AirQ Monitor</Text>
          
          {/* Connection Status and Button */}
          <View style={styles.connectionContainer}>
            {/* Last Update Time replacing Live Indicator */}
            {isConnected && lastUpdate.airQuality && (
              <View style={styles.updateIndicator}>
                <Text style={styles.updateIndicatorText}>
                  {formatTimeSinceUpdate(lastUpdate.airQuality)}
                </Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[
                styles.connectionButton,
                isConnected ? styles.connectionButtonConnected : styles.connectionButtonDisconnected
              ]}
              onPress={isConnected ? handleDisconnect : handleConnect}
              disabled={isConnecting || isAutoConnecting}
            >
              <Text style={[
                styles.connectionButtonText,
                isConnected ? styles.connectionButtonTextConnected : styles.connectionButtonTextDisconnected
              ]}>
                {isConnecting || isAutoConnecting ? 'Connecting...' : 
                 isConnected ? 'Disconnect' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.gradient}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Show main content only when connected */}
          {isConnected ? (
            <>
              <View style={styles.metricsGrid}>
                <MetricCard
                  title="PM1.0"
                  value={airQualityData.pm1}
                  unit="μg/m³"
                  status={getPM25Status(airQualityData.pm1)}
                  type="pm1"
                  onViewGraph={handleViewGraph}
                  hasGraphData={pm1History.length > 0}
                />
                <MetricCard
                  title="PM2.5"
                  value={airQualityData.pm25}
                  unit="μg/m³"
                  status={getPM25Status(airQualityData.pm25)}
                  type="pm25"
                  onViewGraph={handleViewGraph}
                  hasGraphData={pm25History.length > 0}
                />
                <MetricCard
                  title="PM10"
                  value={airQualityData.pm10}
                  unit="μg/m³"
                  status={getPM10Status(airQualityData.pm10)}
                  type="pm10"
                  onViewGraph={handleViewGraph}
                  hasGraphData={pm10History.length > 0}
                />
                <MetricCard
                  title="AQI"
                  value={airQualityData.aqi}
                  unit=""
                  status={getAQIStatus(airQualityData.aqi)}
                  type="aqi"
                  onViewGraph={handleViewGraph}
                  hasGraphData={aqiHistory.length > 0}
                />
                <MetricCard
                  title="Battery"
                  value={battery}
                  unit="%"
                  status={getBatteryStatus(battery)}
                  type="battery"
                  onViewGraph={handleViewGraph}
                  hasGraphData={batteryHistory.length > 0}
                />
                <MetricCard
                  title="Power Mode"
                  value={powerMode}
                  unit=""
                  status="normal"
                  type="power"
                  onViewGraph={null}
                  hasGraphData={false}
                />
              </View>

              {/* Real-time Statistics */}
              {updateCount > 0 && (
                <View style={styles.statsSection}>
                  <Text style={styles.statsTitle}>📊 Live Stats</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{updateCount}</Text>
                      <Text style={styles.statLabel}>Updates Received</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {lastUpdate.airQuality ? Math.round((currentTime - lastUpdate.airQuality) / 1000) : '∞'}s
                      </Text>
                      <Text style={styles.statLabel}>Last Update</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Device Info */}
              {deviceInfo.name && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoTitle}>Device Information</Text>
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Device Name</Text>
                      <Text style={styles.infoValue}>{deviceInfo.name}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Platform</Text>
                      <Text style={styles.infoValue}>{Platform.OS} {Platform.Version}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>App Version</Text>
                      <Text style={styles.infoValue}>1.0.0</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Data Points</Text>
                      <Text style={styles.infoValue}>{pm25History.length}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Updates Received</Text>
                      <Text style={styles.infoValue}>{updateCount}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>AQI Readings</Text>
                      <Text style={styles.infoValue}>{aqiHistory.length}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Connection Status</Text>
                      <Text style={[styles.infoValue, { color: '#50fa7b' }]}>Live & Active</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Power Mode Control */}
              <View style={styles.powerModeSection}>
                <Text style={styles.sectionTitle}>Power Mode Control</Text>
                <View style={styles.powerModeContainer}>
                  <View style={styles.powerModeInfo}>
                    <Text style={styles.powerModeLabel}>Current Mode:</Text>
                    <Text style={[styles.powerModeValue, { 
                      color: powerMode === '1' ? '#ff6b6b' : '#50fa7b' 
                    }]}>
                      {powerMode === '1' ? 'Low Power (Deep Sleep)' : 
                       powerMode === '0' ? 'Responsive (Light Sleep)' : 'Unknown'}
                    </Text>
                  </View>
                  
                  <View style={styles.powerModeButtons}>
                    <TouchableOpacity
                      style={[
                        styles.powerModeButton,
                        powerMode === '1' && styles.powerModeButtonActive
                      ]}
                      onPress={() => handlePowerModeChange(true)}
                    >
                      <Text style={[
                        styles.powerModeButtonText,
                        powerMode === '1' && styles.powerModeButtonTextActive
                      ]}>
                        Low Power
                      </Text>
                      <Text style={styles.powerModeButtonSubtext}>
                        Max battery life
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        styles.powerModeButton,
                        powerMode === '0' && styles.powerModeButtonActive
                      ]}
                      onPress={() => handlePowerModeChange(false)}
                    >
                      <Text style={[
                        styles.powerModeButtonText,
                        powerMode === '0' && styles.powerModeButtonTextActive
                      ]}>
                        Responsive
                      </Text>
                      <Text style={styles.powerModeButtonSubtext}>
                        BLE stays active
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.powerModeDescription}>
                    <Text style={styles.powerModeDescText}>
                      {powerMode === '1' ? 
                        '• Deep sleep between readings\n• BLE disconnects to save power\n• Maximum battery life' :
                        '• Light sleep between readings\n• BLE stays connected\n• Faster response time'
                      }
                    </Text>
                  </View>
                </View>
              </View>

              {/* Logged Data Management */}
              <View style={styles.loggedDataSection}>
                <Text style={styles.sectionTitle}>Data Management</Text>
                <View style={styles.loggedDataContainer}>
                  <View style={styles.loggedDataInfo}>
                    <Text style={styles.loggedDataLabel}>Device Storage:</Text>
                    <Text style={styles.loggedDataValue}>
                      Up to 10,000 readings stored in flash memory
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.loggedDataButton}
                    onPress={() => setLoggedDataModalVisible(true)}
                  >
                    <Text style={styles.loggedDataButtonText}>
                      📥 Download Logged Data
                    </Text>
                    <Text style={styles.loggedDataButtonSubtext}>
                      Get historical readings from device
                    </Text>
                  </TouchableOpacity>
                  
                  <View style={styles.loggedDataDescription}>
                    <Text style={styles.loggedDataDescText}>
                      • Download up to 10,000 readings from device storage{'\n'}
                      • Export data as CSV file for analysis{'\n'}
                      • View historical air quality trends{'\n'}
                      • Note: Device only logs data after time sync
                    </Text>
                  </View>
                </View>
              </View>

              {/* RTC Time Sync */}
              <View style={styles.rtcTimeSection}>
                <Text style={styles.sectionTitle}>Device Time Sync (Required for Logging)</Text>
                <View style={styles.rtcTimeContainer}>
                  <View style={styles.rtcTimeInfo}>
                    <Text style={styles.rtcTimeLabel}>Sync Status:</Text>
                    <Text style={styles.rtcTimeValue}>
                      Auto-synced on connect
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.rtcTimeButton}
                    onPress={handleSyncTime}
                  >
                    <Text style={styles.rtcTimeButtonText}>
                      🕐 Sync Time Now
                    </Text>
                    <Text style={styles.rtcTimeButtonSubtext}>
                      Update device clock with current time
                    </Text>
                  </TouchableOpacity>
                  
                  <View style={styles.rtcTimeDescription}>
                    <Text style={styles.rtcTimeDescText}>
                      • Device automatically syncs time when connected{'\n'}
                      • RTC maintains accurate timestamps for logged data{'\n'}
                      • Data logging is DISABLED until time is synced{'\n'}
                      • Time is periodically saved to survive power cycles{'\n'}
                      • Manual sync available if time drift occurs
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            /* Disconnected State - Show only large connect button */
            <View style={styles.disconnectedContainer}>
              <View style={styles.disconnectedContent}>
                <Text style={styles.disconnectedTitle}>AirQ Monitor</Text>
                <Text style={styles.disconnectedSubtitle}>Connect to your air quality sensor</Text>
                
                <TouchableOpacity
                  style={styles.largeConnectButton}
                  onPress={handleConnect}
                  disabled={isConnecting || isAutoConnecting}
                >
                  <Text style={styles.largeConnectButtonText}>
                    {isConnecting || isAutoConnecting ? 'Connecting...' : 'Connect Device'}
                  </Text>
                </TouchableOpacity>

                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Graph Modal */}
      <GraphModal
        visible={graphModalVisible}
        onClose={handleCloseGraph}
        title={selectedGraphData.title}
        data={selectedGraphData.data}
        type={selectedGraphData.type}
        unit={selectedGraphData.unit}
      />

      {/* Logged Data Modal */}
      <LoggedDataModal
        visible={loggedDataModalVisible}
        onClose={() => setLoggedDataModalVisible(false)}
        data={batteryHistory} // Pass the data to be displayed
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  stickyHeader: {
    backgroundColor: 'rgb(0, 0, 0)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(255, 255, 255)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      }
    }),
  },
  stickyHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8f8f2',
  },
  connectionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
  },
  connectionButtonConnected: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#ff6b6b',
  },
  connectionButtonDisconnected: {
    backgroundColor: 'rgba(80, 250, 123, 0.1)',
    borderColor: '#50fa7b',
  },
  connectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  connectionButtonTextConnected: {
    color: '#ff6b6b',
  },
  connectionButtonTextDisconnected: {
    color: '#50fa7b',
  },
  updateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(80, 250, 123, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#50fa7b',
  },
  updateIndicatorText: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 1.0)',
    letterSpacing: 0.5,
  },
  gradient: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statsSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(80, 250, 123, 0.2)',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f8f2',
    marginBottom: 15,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    backgroundColor: 'rgba(80, 250, 123, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#50fa7b',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#50fa7b',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#a6a6b8',
    textAlign: 'center',
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'column',
    marginBottom: 30,
  },
  infoSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(189, 147, 249, 0.2)',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8f8f2',
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoItem: {
    backgroundColor: 'rgba(189, 147, 249, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    width: width < 400 ? '100%' : '48%',
    borderLeftWidth: 4,
    borderLeftColor: '#bd93f9',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8f8f2',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#a6a6b8',
  },
  powerModeSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(189, 147, 249, 0.2)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f8f2',
    marginBottom: 16,
  },
  powerModeContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(189, 147, 249, 0.3)',
    paddingTop: 16,
  },
  powerModeInfo: {
    marginBottom: 16,
  },
  powerModeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a6a6b8',
    marginBottom: 4,
  },
  powerModeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#50fa7b',
  },
  powerModeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  powerModeButton: {
    flex: 1,
    backgroundColor: 'rgba(80, 250, 123, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  powerModeButtonActive: {
    borderColor: '#50fa7b',
  },
  powerModeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#50fa7b',
  },
  powerModeButtonTextActive: {
    color: '#ffffff',
  },
  powerModeButtonSubtext: {
    fontSize: 12,
    color: '#a6a6b8',
    marginTop: 4,
  },
  powerModeDescription: {
    backgroundColor: 'rgba(80, 250, 123, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  powerModeDescText: {
    fontSize: 14,
    color: '#f8f8f2',
    lineHeight: 20,
  },
  loggedDataSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 108, 0.2)',
  },
  loggedDataContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 184, 108, 0.3)',
    paddingTop: 16,
  },
  loggedDataInfo: {
    marginBottom: 16,
  },
  loggedDataLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a6a6b8',
    marginBottom: 4,
  },
  loggedDataValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffb86c',
  },
  loggedDataButton: {
    backgroundColor: 'rgba(255, 184, 108, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffb86c',
  },
  loggedDataButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffb86c',
    marginBottom: 4,
  },
  loggedDataButtonSubtext: {
    fontSize: 12,
    color: '#a6a6b8',
  },
  loggedDataDescription: {
    backgroundColor: 'rgba(255, 184, 108, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  loggedDataDescText: {
    fontSize: 14,
    color: '#f8f8f2',
    lineHeight: 20,
  },
  rtcTimeSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(80, 250, 123, 0.2)',
  },
  rtcTimeContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(80, 250, 123, 0.3)',
    paddingTop: 16,
  },
  rtcTimeInfo: {
    marginBottom: 16,
  },
  rtcTimeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a6a6b8',
    marginBottom: 4,
  },
  rtcTimeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#50fa7b',
  },
  rtcTimeButton: {
    backgroundColor: 'rgba(80, 250, 123, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#50fa7b',
  },
  rtcTimeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#50fa7b',
    marginBottom: 4,
  },
  rtcTimeButtonSubtext: {
    fontSize: 12,
    color: '#a6a6b8',
  },
  rtcTimeDescription: {
    backgroundColor: 'rgba(80, 250, 123, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  rtcTimeDescText: {
    fontSize: 14,
    color: '#f8f8f2',
    lineHeight: 20,
  },
  disconnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    minHeight: height * 0.7,
  },
  disconnectedContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  disconnectedTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f8f8f2',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 1,
  },
  disconnectedSubtitle: {
    fontSize: 16,
    color: '#a6a6b8',
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 24,
  },
  largeConnectButton: {
    backgroundColor: '#50fa7b',
    borderRadius: 24,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#50fa7b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  largeConnectButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0a0a0f',
    letterSpacing: 1,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    color: '#ff6b6b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
