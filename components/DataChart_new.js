import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

const DataChart = ({ data, title, color, unit }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (data && data.length > 0) {
      // Animate in when new data arrives
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [data?.length]);

  // Format data for react-native-chart-kit with more points for smoother curves
  const formatChartData = () => {
    if (!data || data.length === 0) {
      return {
        labels: [],
        datasets: [{
          data: []
        }]
      };
    }

    // Take last 20 data points for smoother real-time visualization
    const recentData = data.slice(-20);
    
    const labels = recentData.map((_, index) => {
      if (index % 4 === 0) { // Show every 4th label to avoid crowding
        const date = new Date(recentData[index].timestamp);
        return date.toLocaleTimeString().slice(0, 5); // HH:MM format
      }
      return '';
    });

    const values = recentData.map(item => item.value || 0);

    return {
      labels,
      datasets: [{
        data: values,
        color: (opacity = 1) => color || `rgba(134, 65, 244, ${opacity})`,
        strokeWidth: 2.5
      }]
    };
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'rgba(255, 255, 255, 0.1)',
    backgroundGradientTo: 'rgba(255, 255, 255, 0.05)',
    decimalPlaces: title.includes('HRV') ? 1 : 0,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.8})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.6})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: "3",
      strokeWidth: "1",
      stroke: color || "#bd93f9"
    },
    propsForBackgroundLines: {
      strokeDasharray: "5,5",
      stroke: "rgba(255, 255, 255, 0.1)"
    },
    fillShadowGradient: color || '#bd93f9',
    fillShadowGradientOpacity: 0.2,
  };

  const getLastValue = () => {
    if (!data || data.length === 0) return 'No data';
    const lastPoint = data[data.length - 1];
    return `${lastPoint.value}${unit}`;
  };

  const getTrend = () => {
    if (!data || data.length < 2) return null;
    const lastTwo = data.slice(-2);
    const trend = lastTwo[1].value - lastTwo[0].value;
    return trend;
  };

  const renderTrendIndicator = () => {
    const trend = getTrend();
    if (trend === null) return null;

    const isPositive = trend > 0;
    const trendColor = isPositive ? '#50fa7b' : trend < 0 ? '#ff5555' : '#f8f8f2';
    const trendIcon = isPositive ? '↗' : trend < 0 ? '↘' : '→';

    return (
      <View style={styles.trendContainer}>
        <Text style={[styles.trendIcon, { color: trendColor }]}>{trendIcon}</Text>
        <Text style={[styles.trendText, { color: trendColor }]}>
          {Math.abs(trend).toFixed(1)}{unit}
        </Text>
      </View>
    );
  };

  if (!data || data.length === 0) {
    return (
      <Animated.View 
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>📊</Text>
          <Text style={styles.noDataSubtext}>
            Connect to device and place finger on sensor to see measurements
          </Text>
        </View>
      </Animated.View>
    );
  }

  const chartData = formatChartData();
  
  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.currentValue}>{getLastValue()}</Text>
          {renderTrendIndicator()}
        </View>
      </View>
      
      {chartData.datasets[0].data.length > 0 && (
        <LineChart
          data={chartData}
          width={width - 40}
          height={180}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withHorizontalLabels={true}
          withVerticalLabels={false}
          withDots={true}
          withShadow={true}
          withScrollableDot={false}
        />
      )}
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {data.length} data points • Live updating
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(139, 69, 19, 0.2)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8f8f2',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#50fa7b',
    marginRight: 10,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  footer: {
    marginTop: 10,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#a6a6b8',
    fontWeight: '500',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 48,
    marginBottom: 10,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#a6a6b8',
    textAlign: 'center',
    maxWidth: 250,
    lineHeight: 20,
  },
});

export default DataChart;
