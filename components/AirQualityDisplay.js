import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import MetricCard from './MetricCard';

const AirQualityDisplay = ({ 
  airQualityData, 
  batteryLevel, 
  powerMode, 
  isConnected, 
  lastUpdate 
}) => {
  // Parse air quality data (format: "pm1,pm2.5,pm10,battery")
  const parseAirQualityData = (data) => {
    if (!data || typeof data !== 'string') {
      return { pm1: 0, pm25: 0, pm10: 0, battery: 0 };
    }
    
    const values = data.split(',');
    return {
      pm1: parseFloat(values[0]) || 0,
      pm25: parseFloat(values[1]) || 0,
      pm10: parseFloat(values[2]) || 0,
      battery: parseFloat(values[3]) || batteryLevel || 0
    };
  };

  // Calculate AQI from PM2.5 (simplified US EPA formula)
  const calculateAQI = (pm25) => {
    if (pm25 <= 12) return Math.round(pm25 * 50 / 12);
    if (pm25 <= 35.4) return Math.round(50 + (pm25 - 12) * 50 / 23.4);
    if (pm25 <= 55.4) return Math.round(100 + (pm25 - 35.4) * 50 / 20);
    if (pm25 <= 150.4) return Math.round(150 + (pm25 - 55.4) * 100 / 95);
    if (pm25 <= 250.4) return Math.round(200 + (pm25 - 150.4) * 100 / 100);
    return Math.round(300 + (pm25 - 250.4) * 100 / 149.6);
  };

  // Get air quality status based on PM2.5 levels
  const getAirQualityStatus = (pm25) => {
    if (pm25 <= 15) return 'normal';
    if (pm25 <= 25) return 'warning';
    return 'critical';
  };

  // Get power mode display text
  const getPowerModeText = (mode) => {
    if (mode === true || mode === '1') return 'Low Power';
    if (mode === false || mode === '0') return 'Responsive';
    return 'Unknown';
  };

  const data = parseAirQualityData(airQualityData);
  const aqi = calculateAQI(data.pm25);
  const airQualityStatus = getAirQualityStatus(data.pm25);

  if (!isConnected) {
    return (
      <View style={styles.disconnectedContainer}>
        <Text style={styles.disconnectedText}>
          🌪️ Connect to AirQ device to view air quality data
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Air Quality Monitor</Text>
        <Text style={styles.headerSubtitle}>
          Real-time particulate matter readings
        </Text>
      </View>

      {/* Primary Air Quality Metrics */}
      <View style={styles.metricsGrid}>
        <MetricCard
          title="PM2.5"
          value={data.pm25}
          unit="µg/m³"
          status={airQualityStatus}
          icon="🫁"
          lastUpdate={lastUpdate}
          precision={1}
          type="pm25"
        />
        
        <MetricCard
          title="PM10"
          value={data.pm10}
          unit="µg/m³"
          status={getAirQualityStatus(data.pm10 / 2)} // PM10 has different thresholds
          icon="💨"
          lastUpdate={lastUpdate}
          precision={1}
          type="pm10"
        />
      </View>

      {/* Secondary Metrics */}
      <View style={styles.metricsGrid}>
        <MetricCard
          title="PM1.0"
          value={data.pm1}
          unit="µg/m³"
          status={getAirQualityStatus(data.pm1 * 1.5)} // PM1.0 adjusted scale
          icon="💨"
          lastUpdate={lastUpdate}
          precision={1}
          type="pm1"
        />
        
        <MetricCard
          title="AQI"
          value={aqi}
          unit="US EPA"
          status={aqi <= 50 ? 'normal' : aqi <= 100 ? 'warning' : 'critical'}
          icon="📊"
          lastUpdate={lastUpdate}
          precision={0}
          type="air-quality"
        />
      </View>

      {/* Device Status */}
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Battery"
          value={data.battery}
          unit="%"
          status={data.battery > 50 ? 'normal' : data.battery > 20 ? 'warning' : 'critical'}
          icon="🔋"
          lastUpdate={lastUpdate}
          precision={0}
          type="battery"
        />
        
        <View style={styles.powerModeCard}>
          <Text style={styles.powerModeTitle}>Power Mode</Text>
          <Text style={styles.powerModeValue}>
            {getPowerModeText(powerMode)}
          </Text>
          <Text style={styles.powerModeDescription}>
            {powerMode === true || powerMode === '1' 
              ? 'Deep sleep for battery saving' 
              : 'Light sleep, BLE responsive'}
          </Text>
        </View>
      </View>

      {/* Air Quality Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Air Quality Summary</Text>
        <View style={[styles.summaryIndicator, { backgroundColor: getAirQualityStatus(data.pm25) === 'normal' ? '#4ade80' : getAirQualityStatus(data.pm25) === 'warning' ? '#fbbf24' : '#f87171' }]}>
          <Text style={styles.summaryStatus}>
            {data.pm25 <= 15 ? 'GOOD' : data.pm25 <= 25 ? 'MODERATE' : data.pm25 <= 50 ? 'POOR' : 'VERY POOR'}
          </Text>
        </View>
        <Text style={styles.summaryDescription}>
          {data.pm25 <= 15 
            ? 'Air quality is satisfactory and poses little or no health risk.'
            : data.pm25 <= 25 
            ? 'Air quality is acceptable for most people.'
            : data.pm25 <= 50 
            ? 'Members of sensitive groups may experience health effects.'
            : 'Health risk for everyone. Limit outdoor activities.'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
  },
  disconnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  disconnectedText: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  powerModeCard: {
    flex: 1,
    marginLeft: 7.5,
    padding: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  powerModeTitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 8,
  },
  powerModeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  powerModeDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  summaryCard: {
    marginTop: 10,
    padding: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
  },
  summaryIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 15,
  },
  summaryStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  summaryDescription: {
    fontSize: 14,
    color: '#d1d5db',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AirQualityDisplay;
