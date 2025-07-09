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
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <View style={styles.gradient}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>AirQ Monitor</Text>
            <Text style={styles.headerSubtitle}>
              Real-time air quality monitoring with PM1.0, PM2.5, PM10, and AQI
            </Text>
            {isConnected && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveIndicatorDot} />
                <Text style={styles.liveIndicatorText}>LIVE</Text>
              </View>
            )}
          </View>

          {/* Connection Section */}
          <ConnectionSection
            isConnected={isConnected}
            isConnecting={isConnecting}
            isAutoConnecting={isAutoConnecting}
            autoConnectEnabled={autoConnectEnabled}
            deviceInfo={deviceInfo}
            error={error}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onForgetDevice={handleForgetDevice}
            onToggleAutoConnect={handleToggleAutoConnect}
          />

          {/* Air Quality Display */}
          {isConnected && (
            <AirQualityDisplay 
              airQualityData={airQualityData}
              battery={battery}
              powerMode={powerMode}
              isConnected={isConnected}
            />
          )}

          {/* Metrics Grid */}
          <View style={styles.metricsGrid}>
            <MetricCard
              title="PM1.0"
              value={airQualityData.pm1}
              unit="μg/m³"
              icon="💨"
              status={getPM25Status(airQualityData.pm1)}
              lastUpdate={lastUpdate.airQuality}
              type="pm1"
            />
            <MetricCard
              title="PM2.5"
              value={airQualityData.pm25}
              unit="μg/m³"
              icon="🌫️"
              status={getPM25Status(airQualityData.pm25)}
              lastUpdate={lastUpdate.airQuality}
              type="pm25"
            />
            <MetricCard
              title="PM10"
              value={airQualityData.pm10}
              unit="μg/m³"
              icon="🌪️"
              status={getPM10Status(airQualityData.pm10)}
              lastUpdate={lastUpdate.airQuality}
              type="pm10"
            />
            <MetricCard
              title="AQI"
              value={airQualityData.aqi}
              unit=""
              icon="📊"
              status={getAQIStatus(airQualityData.aqi)}
              lastUpdate={lastUpdate.airQuality}
              type="aqi"
            />
            <MetricCard
              title="Battery"
              value={battery}
              unit="%"
              icon="🔋"
              status={getBatteryStatus(battery)}
              lastUpdate={lastUpdate.battery}
              type="battery"
            />
            <MetricCard
              title="Power Mode"
              value={powerMode}
              unit=""
              icon="⚡"
              status="normal"
              lastUpdate={lastUpdate.powerMode}
              type="power"
            />
          </View>

          {/* Real-time Statistics */}
          {isConnected && updateCount > 0 && (
            <View style={styles.statsSection}>
              <Text style={styles.statsTitle}>📊 Live Stats</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{updateCount}</Text>
                  <Text style={styles.statLabel}>Updates Received</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{pm25History.length + pm10History.length + aqiHistory.length}</Text>
                  <Text style={styles.statLabel}>Data Points</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {lastUpdate.airQuality ? Math.round((Date.now() - lastUpdate.airQuality) / 1000) : '∞'}s
                  </Text>
                  <Text style={styles.statLabel}>Last Update</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>1Hz</Text>
                  <Text style={styles.statLabel}>Update Rate</Text>
                </View>
              </View>
            </View>
          )}

          {/* Charts */}
          {isConnected && (
            <>
              <DataChart
                title="PM2.5 Trend"
                data={pm25History}
                color="#ff5555"
                unit="μg/m³"
              />
              <DataChart
                title="PM10 Trend"
                data={pm10History}
                color="#8be9fd"
                unit="μg/m³"
              />
              <DataChart
                title="AQI Trend"
                data={aqiHistory}
                color="#50fa7b"
                unit=""
              />
            </>
          )}

          {/* Device Info */}
          {isConnected && deviceInfo.name && (
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
          {isConnected && (
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
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  gradient: {
    flex: 1,
    backgroundColor: '#1e1e2e',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(30, 30, 46, 0.8)',
    borderRadius: 24,
    marginTop: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(189, 147, 249, 0.2)',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f8f8f2',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#a6a6b8',
    textAlign: 'center',
    maxWidth: 300,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(80, 250, 123, 0.2)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#50fa7b',
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#50fa7b',
    marginRight: 8,
  },
  liveIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#50fa7b',
    letterSpacing: 1,
  },
  statsSection: {
    backgroundColor: 'rgba(30, 30, 46, 0.9)',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  infoSection: {
    backgroundColor: 'rgba(30, 30, 46, 0.9)',
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
    backgroundColor: 'rgba(30, 30, 46, 0.9)',
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
});
