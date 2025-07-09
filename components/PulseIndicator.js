import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';

const PulseIndicator = ({ heartRate, isActive = false }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive && heartRate > 0) {
      const bpm = heartRate;
      const beatInterval = 60000 / bpm; // Convert BPM to milliseconds
      
      const createPulse = () => {
        // Heart beat animation
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();

        // Ripple effect
        rippleAnim.setValue(0);
        Animated.timing(rippleAnim, {
          toValue: 1,
          duration: beatInterval * 0.8,
          useNativeDriver: true,
        }).start();
      };

      // Start pulsing
      createPulse();
      const interval = setInterval(createPulse, beatInterval);
      
      return () => clearInterval(interval);
    }
  }, [heartRate, isActive, pulseAnim, rippleAnim]);

  if (!isActive || heartRate === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.inactiveHeart}>
          <Text style={styles.heartIcon}>💓</Text>
          <Text style={styles.inactiveText}>Place finger on sensor</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pulseContainer}>
        {/* Ripple effect */}
        <Animated.View
          style={[
            styles.ripple,
            {
              transform: [
                {
                  scale: rippleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 3],
                  }),
                },
              ],
              opacity: rippleAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.8, 0.4, 0],
              }),
            },
          ]}
        />
        
        {/* Pulsing heart */}
        <Animated.View
          style={[
            styles.heart,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Text style={styles.heartIcon}>❤️</Text>
        </Animated.View>
        
        {/* BPM display */}
        <Text style={styles.bpmText}>{heartRate} BPM</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  pulseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ripple: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff5555',
    opacity: 0.3,
  },
  heart: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 85, 85, 0.2)',
    marginBottom: 10,
  },
  heartIcon: {
    fontSize: 32,
  },
  bpmText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff5555',
    textAlign: 'center',
  },
  inactiveHeart: {
    alignItems: 'center',
    opacity: 0.5,
  },
  inactiveText: {
    fontSize: 12,
    color: '#a6a6b8',
    marginTop: 5,
    textAlign: 'center',
  },
});

export default PulseIndicator;
