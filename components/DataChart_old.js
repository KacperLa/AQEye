import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
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
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.8})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: "4",
      strokeWidth: "2",
      stroke: color || "#8b5cf6"
    },
    propsForBackgroundLines: {
      strokeWidth: 1,
      stroke: "rgba(255, 255, 255, 0.2)"
    }
  };

  const chartData = formatChartData();
  const hasData = chartData.datasets[0].data.length > 0;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title} History</Text>
      
      {hasData ? (
        <View style={styles.chartContainer}>
          <LineChart
            data={chartData}
            width={width - 60}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
            transparent={true}
            withInnerLines={true}
            withOuterLines={true}
            withVerticalLines={true}
            withHorizontalLines={true}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            yAxisSuffix={unit}
            yAxisInterval={1}
          />
        </View>
      ) : (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataIcon}>📊</Text>
          <Text style={styles.noDataText}>
            No data available
          </Text>
          <Text style={styles.noDataSubtext}>
            Connect to device and place finger on sensor to see measurements
          </Text>        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({  container: {
    margin: 15,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(139, 69, 19, 0.2)',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
    textAlign: 'center',
  },
  chartContainer: {
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 16,
  },
  chart: {
    borderRadius: 16,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default DataChart;
