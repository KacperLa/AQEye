import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Switch,
  Platform,
} from 'react-native';
import WebCompatiblePressable from './WebCompatiblePressable';

const { width } = Dimensions.get('window');

const ConnectionSection = ({
  isConnected,
  isConnecting,
  isAutoConnecting,
  autoConnectEnabled,
  deviceInfo,
  error,
  onConnect,
  onDisconnect,
  onForgetDevice,
  onToggleAutoConnect,
}) => {
  const getStatusText = () => {
    if (isAutoConnecting) return 'Auto-connecting...';
    if (isConnecting) return 'Connecting...';
    if (isConnected) return `Connected to ${deviceInfo.name || 'AirQ Sensor'}`;
    return 'Disconnected';
  };
  const getStatusColor = () => {
    if (isConnecting || isAutoConnecting) return '#fbbf24'; // yellow
    if (isConnected) return '#4ade80'; // green
    return '#f87171'; // red
  };

  const getUnifiedButtonColor = () => {
    if (isConnecting || isAutoConnecting) return '#fbbf24'; // yellow
    if (isConnected) return '#ef4444'; // red for disconnect
    return '#4ade80'; // green for connect
  };

  const getUnifiedButtonText = () => {
    if (isAutoConnecting) return 'Auto-connecting...';
    if (isConnecting) return 'Connecting...';
    if (isConnected) return `Connected • ${deviceInfo.name || 'AirQ'}`;
    return 'Connect to AirQ Device';
  };

  const getUnifiedButtonAction = () => {
    if (isConnected) return onDisconnect;
    return onConnect;
  };

  return (
    <View style={styles.container}>
      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Unified Connection Button */}
      <View style={styles.controlsContainer}>
        <WebCompatiblePressable
          style={({ pressed }) => [
            styles.unifiedButton,
            { backgroundColor: getUnifiedButtonColor() },
            (isConnecting || isAutoConnecting) && styles.buttonDisabled,
            pressed && { opacity: 0.8 }
          ]}
          onPress={getUnifiedButtonAction()}
          disabled={isConnecting || isAutoConnecting}
        >
          <View style={styles.unifiedButtonContent}>
            <View style={[styles.statusDot, { backgroundColor: '#ffffff' }]} />
            <Text style={styles.unifiedButtonText}>
              {getUnifiedButtonText()}
            </Text>
          </View>
        </WebCompatiblePressable>
        
        {/* Secondary controls */}
        {isConnected && (
          <WebCompatiblePressable
            style={({ pressed }) => [
              styles.forgetButton,
              pressed && { opacity: 0.8 }
            ]}
            onPress={onForgetDevice}
          >
            <View style={[styles.buttonGradient, styles.forgetButtonGradient]}>
              <Text style={styles.buttonText}>Forget Device</Text>
            </View>
          </WebCompatiblePressable>
        )}
      </View>

      {/* Auto-Connect Control */}
      <View style={styles.autoConnectContainer}>
        <Text style={styles.autoConnectLabel}>Remember device for quick reconnect</Text>
        <Switch
          value={autoConnectEnabled}
          onValueChange={onToggleAutoConnect}
          trackColor={{ false: '#374151', true: '#8b5cf6' }}
          thumbColor={autoConnectEnabled ? '#ffffff' : '#9ca3af'}
          ios_backgroundColor="#374151"
        />
      </View>

      {/* Device Info */}
      {isConnected && deviceInfo.name && (
        <View style={styles.deviceInfoContainer}>
          <Text style={styles.deviceInfoTitle}>Device Information</Text>
          <View style={styles.deviceInfoRow}>
            <Text style={styles.deviceInfoLabel}>Name:</Text>
            <Text style={styles.deviceInfoValue}>{deviceInfo.name}</Text>
          </View>
          <View style={styles.deviceInfoRow}>
            <Text style={styles.deviceInfoLabel}>Status:</Text>
            <Text style={styles.deviceInfoValue}>Connected</Text>
          </View>
          {deviceInfo.services && deviceInfo.services.length > 0 && (
            <View style={styles.deviceInfoRow}>
              <Text style={styles.deviceInfoLabel}>Services:</Text>
              <Text style={styles.deviceInfoValue}>
                {deviceInfo.services.join(', ')}
              </Text>
            </View>          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 15,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    // Platform-specific shadow styles
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 8px 0 rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#fca5a5',
    flex: 1,
  },
  controlsContainer: {
    marginBottom: 20,
  },
  connectButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },  buttonDisabled: {
    opacity: 0.6,
  },
  unifiedButton: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    // Platform-specific shadow styles
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  unifiedButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },buttonGradient: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  connectButtonGradient: {
    backgroundColor: '#8b5cf6',
  },
  disconnectButtonGradient: {
    backgroundColor: '#ef4444',
  },
  forgetButtonGradient: {
    backgroundColor: '#6b7280',
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  disconnectControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disconnectButton: {
    flex: 1,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },  forgetButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  autoConnectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 15,
  },
  autoConnectLabel: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
    flex: 1,
    marginRight: 15,
  },
  deviceInfoContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 15,
  },
  deviceInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  deviceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  deviceInfoLabel: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.7,
  },
  deviceInfoValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
});

export default ConnectionSection;
