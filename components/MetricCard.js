import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';

const { width } = Dimensions.get('window');

const MetricCard = ({ title, value, unit, status, icon, lastUpdate, precision = 0, type }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const valueAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const prevValue = useRef(value);

  // Air quality status glow animation
  useEffect(() => {
    if (type === 'air-quality' && value > 0) {
      // Different glow colors based on air quality levels
      const startGlow = () => {
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]).start(() => startGlow());
      };

      startGlow();
    }
  }, [value, type, glowAnim]);

  // Value change animation
  useEffect(() => {
    if (value !== prevValue.current && value > 0) {
      // Highlight animation when value changes
      Animated.sequence([
        Animated.timing(valueAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(valueAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: false,
        }),
      ]).start();
      
      prevValue.current = value;
    }
  }, [value, valueAnim]);

  // Continuous glow animation for active metrics
  useEffect(() => {
    if (value > 0) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          }),
        ])
      );
      glow.start();
      
      return () => glow.stop();
    }
  }, [value, glowAnim]);
  const getStatusColor = (status) => {
    switch (status) {
      case 'normal': return '#4ade80'; // green
      case 'warning': return '#fbbf24'; // yellow
      case 'critical': return '#f87171'; // red
      default: return '#9ca3af'; // gray
    }
  };
  const getStatusText = (title, value, status) => {
    if (status === 'invalid' || !value || value === 0 || isNaN(value)) {
      return 'No reading - checking sensor';
    }

    switch (title) {
      case 'PM2.5':
        if (value <= 15) return 'Good - WHO recommended levels';
        if (value <= 25) return 'Moderate - Acceptable levels';
        if (value <= 50) return 'Poor - Sensitive groups affected';
        return 'Very Poor - Health risk for everyone';
      
      case 'PM10':
        if (value <= 25) return 'Good air quality';
        if (value <= 50) return 'Moderate air quality';
        if (value <= 90) return 'Poor air quality';
        return 'Very poor air quality';

      case 'PM1.0':
        if (value <= 10) return 'Very good';
        if (value <= 20) return 'Good';
        if (value <= 35) return 'Moderate';
        return 'Poor';
        
      case 'Battery':
        if (value < 20) return 'Low battery';
        if (value < 50) return 'Medium battery';
        return 'Good battery level';
      
      case 'AQI':
        if (value <= 50) return 'Good - Air quality satisfactory';
        if (value <= 100) return 'Moderate - Acceptable for most people';
        if (value <= 150) return 'Unhealthy for sensitive groups';
        if (value <= 200) return 'Unhealthy - Everyone may experience effects';
        if (value <= 300) return 'Very unhealthy - Health alert';
        return 'Hazardous - Emergency conditions';
      
      default:
        return 'Reading available';
    }
  };

  const formatLastUpdate = (timestamp) => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const update = new Date(timestamp);
    const diffMs = now - update;
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 5) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    return `${Math.floor(diffSecs / 3600)}h ago`;
  };

  const getGlowColor = () => {
    switch (type) {
      case 'pm25': return '#4ade80'; // green for PM2.5
      case 'pm10': return '#3b82f6'; // blue for PM10
      case 'pm1': return '#8b5cf6';  // purple for PM1.0
      case 'air-quality': return '#f59e0b'; // amber for AQI
      case 'battery': return '#ffb86c'; // orange for battery
      default: return '#6b7280'; // gray default
    }
  };  return (
    <Animated.View 
      style={[
        styles.container,
        value > 0 && {
          borderColor: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['rgba(255, 255, 255, 0.1)', `${getGlowColor()}40`]
          })
        }
      ]}
    >
      <View style={styles.header}>
        <Animated.Text 
          style={[
            styles.icon, 
            type === 'heart-rate' && value > 0 ? {
              transform: [{ scale: pulseAnim }]
            } : {}
          ]}
        >
          {icon}
        </Animated.Text>
        <Text style={styles.title}>{title}</Text>
        {value > 0 && (
          <View style={[styles.liveDot, { backgroundColor: getGlowColor() }]} />
        )}
      </View>
      
      <View style={styles.valueContainer}>
        <Animated.Text 
          style={[
            styles.value,
            {
              backgroundColor: valueAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['transparent', 'rgba(80, 250, 123, 0.2)']
              }),
              borderRadius: 8,
              paddingHorizontal: 4,
            }
          ]}
        >
          {(value && !isNaN(value)) ? (precision > 0 ? value.toFixed(precision) : Math.round(value)) : 0}
        </Animated.Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      
      <View style={styles.statusContainer}>
        <Animated.View 
          style={[
            styles.statusDot, 
            { backgroundColor: getStatusColor(status) },
            value > 0 && {
              opacity: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1]
              })
            }
          ]} 
        />
        <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
          {getStatusText(title, value, status)}
        </Text>
      </View>
      
      {lastUpdate && (
        <Text style={styles.updateText}>
          {formatLastUpdate(lastUpdate)}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: (width - 60) / 2,
    margin: 10,
    padding: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(139, 69, 19, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
      }
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 15,
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  unit: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.7,
    marginLeft: 5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  updateText: {
    fontSize: 11,
    color: '#ffffff',
    opacity: 0.6,
    textAlign: 'center',
  },
});

export default MetricCard;
