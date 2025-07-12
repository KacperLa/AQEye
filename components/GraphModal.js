import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import WebCompatiblePressable from './WebCompatiblePressable';
import DataChart from './DataChart';

const { width, height } = Dimensions.get('window');

const GraphModal = ({ visible, onClose, title, data, type, unit }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const getGraphColor = (type) => {
    switch (type) {
      case 'pm1': return '#8b5cf6';  // purple for PM1.0
      case 'pm25': return '#ef4444'; // red for PM2.5
      case 'pm10': return '#3b82f6'; // blue for PM10
      case 'aqi': return '#f59e0b';  // amber for AQI
      case 'battery': return '#10b981'; // green for battery
      default: return '#6b7280'; // gray default
    }
  };

  const formatChartTitle = (title) => {
    switch (title) {
      case 'PM1.0': return 'PM1.0 Historical Data';
      case 'PM2.5': return 'PM2.5 Historical Data';
      case 'PM10': return 'PM10 Historical Data';
      case 'AQI': return 'Air Quality Index History';
      case 'Battery': return 'Battery Level History';
      default: return `${title} Historical Data`;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View 
        style={[
          styles.overlay,
          {
            opacity: fadeAnim,
          }
        ]}
      >
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.modalTitle}>{formatChartTitle(title)}</Text>
            <WebCompatiblePressable
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </WebCompatiblePressable>
          </View>

          {/* Chart */}
          <View style={styles.chartContainer}>
            <DataChart
              title={formatChartTitle(title)}
              data={data}
              color={getGraphColor(type)}
              unit={unit}
              chartWidth={width * 0.85 - 40}
            />
          </View>

          {/* Footer with stats */}
          <View style={styles.footer}>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data ? data.length : 0}</Text>
                <Text style={styles.statLabel}>Data Points</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {data && data.length > 0 ? data[data.length - 1].value?.toFixed(1) || '0' : '0'}
                </Text>
                <Text style={styles.statLabel}>Current Value</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {data && data.length > 1 ? 
                    Math.abs(data[data.length - 1].value - data[data.length - 2].value).toFixed(1) : '0'}
                </Text>
                <Text style={styles.statLabel}>Last Change</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.95,
    maxWidth: width - 20,
    maxHeight: height * 0.85,
    backgroundColor: '#1a1a1f',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
      web: {
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
      }
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  chartContainer: {
    padding: 20,
    paddingHorizontal: 20,
    minHeight: 250,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#50fa7b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#a6a6b8',
    textAlign: 'center',
  },
});

export default GraphModal;
