import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform
} from 'react-native';
import PlatformBluetoothService from '../services/PlatformBluetoothService';

const LoggedDataModal = ({ visible, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loggedData, setLoggedData] = useState(null);
  const [error, setError] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({
    progress: 0,
    message: '',
    stage: '',
    currentChunk: 0,
    totalChunks: 0
  });

  useEffect(() => {
    const handleDownloadProgress = (progressData) => {
      setDownloadProgress(progressData);
    };

    // Add progress listener
    PlatformBluetoothService.addEventListener('downloadProgress', handleDownloadProgress);

    // Cleanup listener when component unmounts
    return () => {
      PlatformBluetoothService.removeEventListener('downloadProgress', handleDownloadProgress);
    };
  }, []);

  const handleDownloadData = async () => {
    setIsLoading(true);
    setError(null);
    setDownloadProgress({
      progress: 0,
      message: 'Starting download...',
      stage: 'starting',
      currentChunk: 0,
      totalChunks: 0
    });

    try {
      const data = await PlatformBluetoothService.downloadLoggedData();
      
      if (data && data.length > 0) {
        setLoggedData(data);
        console.log(`Downloaded ${data.length} logged data entries`);
      } else {
        setError('No logged data found on device');
      }
    } catch (err) {
      console.error('Failed to download logged data:', err);
      setError('Failed to download logged data: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!loggedData || loggedData.length === 0) {
      Alert.alert('No Data', 'No logged data to export');
      return;
    }

    if (Platform.OS === 'web') {
      const filename = `airq_logged_data_${new Date().toISOString().split('T')[0]}.csv`;
      const success = PlatformBluetoothService.downloadLoggedDataAsFile(loggedData, filename);
      
      if (success) {
        Alert.alert('Success', 'CSV file downloaded successfully');
      } else {
        Alert.alert('Error', 'Failed to download CSV file');
      }
    } else {
      // For mobile platforms, you could implement sharing via react-native-share
      const csvContent = PlatformBluetoothService.loggedDataToCSV(loggedData);
      Alert.alert('CSV Data', 'CSV export on mobile not yet implemented. Data:\n\n' + csvContent.substring(0, 200) + '...');
    }
  };

  const handleClose = () => {
    setLoggedData(null);
    setError(null);
    setDownloadProgress({
      progress: 0,
      message: '',
      stage: '',
      currentChunk: 0,
      totalChunks: 0
    });
    onClose();
  };

  const formatDate = (date) => {
    return date.toLocaleString();
  };

  const getAQIColor = (aqi) => {
    if (aqi <= 50) return '#00e400'; // Good - Green
    if (aqi <= 100) return '#ffff00'; // Moderate - Yellow
    if (aqi <= 150) return '#ff7e00'; // Unhealthy for Sensitive Groups - Orange
    if (aqi <= 200) return '#ff0000'; // Unhealthy - Red
    if (aqi <= 300) return '#8f3f97'; // Very Unhealthy - Purple
    return '#7e0023'; // Hazardous - Maroon
  };

  const getAQICategory = (aqi) => {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Logged Data</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {!loggedData && !error && (
              <View style={styles.downloadSection}>
                <Text style={styles.downloadDescription}>
                  Download logged data from your AirQ device's flash storage.
                  This will retrieve all available readings (device stores up to 10,000 entries).
                </Text>
                
                {!isLoading ? (
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={handleDownloadData}
                  >
                    <Text style={styles.downloadButtonText}>Download Data</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text style={styles.progressMessage}>{downloadProgress.message}</Text>
                    </View>
                    
                    <View style={styles.progressBarContainer}>
                      <View 
                        style={[styles.progressBar, { width: `${downloadProgress.progress}%` }]}
                      />
                    </View>
                    
                    <Text style={styles.progressText}>
                      {downloadProgress.progress}%
                      {downloadProgress.totalChunks > 0 && (
                        ` • Chunk ${downloadProgress.currentChunk}/${downloadProgress.totalChunks}`
                      )}
                    </Text>
                    
                    {downloadProgress.stage === 'downloading' && downloadProgress.totalChunks > 1 && (
                      <Text style={styles.progressDetail}>
                        Using chunked transfer for reliable data download
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {error && (
              <View style={styles.errorSection}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleDownloadData}
                  disabled={isLoading}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {loggedData && loggedData.length > 0 && (
              <View style={styles.dataSection}>
                <View style={styles.dataHeader}>
                  <Text style={styles.dataTitle}>
                    {loggedData.length} Logged Readings
                  </Text>
                  <TouchableOpacity
                    style={styles.exportButton}
                    onPress={handleExportCSV}
                  >
                    <Text style={styles.exportButtonText}>Export CSV</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.dataList}>
                  {loggedData.map((entry, index) => (
                    <View key={index} style={styles.dataEntry}>
                      <Text style={styles.dataDate}>
                        {formatDate(entry.date)}
                      </Text>
                      <View style={styles.dataMetrics}>
                        <View style={styles.metricRow}>
                          <Text style={styles.metricLabel}>PM2.5:</Text>
                          <Text style={styles.metricValue}>{entry.pm25.toFixed(1)} μg/m³</Text>
                        </View>
                        <View style={styles.metricRow}>
                          <Text style={styles.metricLabel}>AQI:</Text>
                          <Text style={[styles.metricValue, { color: getAQIColor(entry.aqi) }]}>
                            {entry.aqi} ({getAQICategory(entry.aqi)})
                          </Text>
                        </View>
                        <View style={styles.metricRow}>
                          <Text style={styles.metricLabel}>PM1.0:</Text>
                          <Text style={styles.metricValue}>{entry.pm1.toFixed(1)} μg/m³</Text>
                        </View>
                        <View style={styles.metricRow}>
                          <Text style={styles.metricLabel}>PM10:</Text>
                          <Text style={styles.metricValue}>{entry.pm10.toFixed(1)} μg/m³</Text>
                        </View>
                        <View style={styles.metricRow}>
                          <Text style={styles.metricLabel}>Battery:</Text>
                          <Text style={styles.metricValue}>{entry.battery.toFixed(0)}%</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#000',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  modalContent: {
    maxHeight: 400,
  },
  downloadSection: {
    padding: 20,
    alignItems: 'center',
  },
  downloadDescription: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  downloadButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#666',
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  errorSection: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  dataSection: {
    padding: 20,
  },
  dataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  exportButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  dataList: {
    maxHeight: 300,
  },
  dataEntry: {
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    padding: 15,
    marginBottom: 10,
  },
  dataDate: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 10,
  },
  dataMetrics: {
    flexDirection: 'column',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  metricLabel: {
    fontSize: 14,
    color: '#aaa',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressSection: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  progressMessage: {
    fontSize: 14,
    color: '#fff',
    marginLeft: 10,
    flex: 1,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
    minWidth: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 5,
  },
  progressDetail: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default LoggedDataModal;
